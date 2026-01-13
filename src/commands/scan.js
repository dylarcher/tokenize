#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

import {
	cleanCssValue,
	defaultComponentPatterns,
	getExcludePatterns,
	getOutputDirectory,
	hasFlag,
	isComponentFile,
	loadConfiguration,
	normalizeColorToHex,
	walkDirectory,
} from "../index.js";

/**
 * @typedef {import('../helperUtils/config.js').Config} Config
 */

/** @type {Config} */
const config = await loadConfiguration();
const dirArg = process.argv.slice(2).find((arg) => !arg.startsWith("-"));
const dir = dirArg || config.scanDir || ".";
const outDir = getOutputDirectory(process.argv, config, "./dist/");
const excludePatterns = getExcludePatterns(process.argv, config);
const componentPatterns = config.componentPatterns || defaultComponentPatterns;
const verbose = hasFlag(process.argv, ["-V", "--verbose"]);
const quiet = hasFlag(process.argv, ["-Q", "--quiet"]);
const dryRun = hasFlag(process.argv, ["-N", "--dry-run"]);

const patterns = {
	colors: [/#[0-9a-fA-F]{3,8}\b/g, /rgba?\([^)]+\)/gi, /hsla?\([^)]+\)/gi],
	typography: {
		fontFamily: /font-family:\s*([^;]+)/gi,
		fontSize: /font-size:\s*([^;]+)/gi,
		fontWeight: /font-weight:\s*([^;]+)/gi,
		lineHeight: /line-height:\s*([^;]+)/gi,
		letterSpacing: /letter-spacing:\s*([^;]+)/gi,
	},
	borders: [/border-radius:\s*([^;]+)/gi, /border-width:\s*([^;]+)/gi],
	shadows: [/box-shadow:\s*([^;]+)/gi, /text-shadow:\s*([^;]+)/gi],
	zIndex: [/z-index:\s*(\d+)/gi],
	// New patterns for previously missed styles
	gradients: [/linear-gradient\([^;]+\)/gi, /radial-gradient\([^;]+\)/gi],
	transitions: {
		transition: /transition:\s*([^;]+)/gi,
		transitionDuration: /transition-duration:\s*([^;]+)/gi,
		transitionTimingFunction: /transition-timing-function:\s*([^;]+)/gi,
		transitionProperty: /transition-property:\s*([^;]+)/gi,
	},
	animations: {
		animation: /animation:\s*([^;]+)/gi,
		animationName: /animation-name:\s*([^;]+)/gi,
		animationDuration: /animation-duration:\s*([^;]+)/gi,
	},
	keyframes: /@keyframes\s+([\w-]+)\s*\{/gi,
	transforms: [/transform:\s*([^;]+)/gi],
	filters: [/filter:\s*([^;]+)/gi, /backdrop-filter:\s*([^;]+)/gi],
	opacity: [/opacity:\s*([^;]+)/gi],
	cursors: [/cursor:\s*([\w-]+)/gi],
	gaps: [/gap:\s*([^;]+)/gi, /row-gap:\s*([^;]+)/gi, /column-gap:\s*([^;]+)/gi],
	calc: [/calc\([^)]+\)/gi],
};

/**
 * @typedef {Object} ExtractedValues
 * @property {Set<string>} colors
 * @property {Set<string>} spacing
 * @property {Set<string>} fontFamilies
 * @property {Set<string>} fontSizes
 * @property {Set<string>} fontWeights
 * @property {Set<string>} lineHeights
 * @property {Set<string>} letterSpacings
 * @property {Set<string>} borderRadii
 * @property {Set<string>} borderWidths
 * @property {Set<string>} shadows
 * @property {Set<string>} zIndices
 * @property {Set<string>} gradients
 * @property {Set<string>} transitions
 * @property {Set<string>} animations
 * @property {Set<string>} keyframes
 * @property {Set<string>} transforms
 * @property {Set<string>} filters
 * @property {Set<string>} opacities
 * @property {Set<string>} cursors
 * @property {Set<string>} gaps
 * @property {Set<string>} calcExpressions
 * @property {Set<string>} namespacedVariables
 * @property {Record<string, string>} variables
 * @property {string} source
 */

/**
 * Extracts CSS values from content.
 * @param {string} content - CSS/SCSS content
 * @param {string} filepath - Source file path
 * @returns {ExtractedValues}
 */
function extractValues(content, filepath) {
	/** @type {ExtractedValues} */
	const results = {
		colors: new Set(),
		spacing: new Set(),
		fontFamilies: new Set(),
		fontSizes: new Set(),
		fontWeights: new Set(),
		lineHeights: new Set(),
		letterSpacings: new Set(),
		borderRadii: new Set(),
		borderWidths: new Set(),
		shadows: new Set(),
		zIndices: new Set(),
		gradients: new Set(),
		transitions: new Set(),
		animations: new Set(),
		keyframes: new Set(),
		transforms: new Set(),
		filters: new Set(),
		opacities: new Set(),
		cursors: new Set(),
		gaps: new Set(),
		calcExpressions: new Set(),
		namespacedVariables: new Set(),
		variables: {},
		source: filepath,
	};

	// Extract simple SCSS variables (without multiline values)
	for (const m of content.matchAll(/\$([a-zA-Z][\w-]*)\s*:\s*([^;{]+);/g)) {
		/** @type {string} */
		const varName = m[1];
		const value = m[2].trim();
		// Only store if it's a simple value (not a multiline SCSS map or function body)
		if (
			!value.includes("\n") &&
			!value.includes("@") &&
			!value.startsWith("(")
		) {
			results.variables[varName] = value;
		}
	}

	// Extract CSS custom properties
	for (const m of content.matchAll(/--([a-zA-Z][\w-]*)\s*:\s*([^;]+);/g)) {
		/** @type {string} */
		const cssVarName = m[1];
		results.variables[cssVarName] = m[2].trim();
	}

	// Extract namespaced SCSS module variables (e.g., colors.$c-turquoise-500)
	for (const m of content.matchAll(/([a-zA-Z][\w-]*)\.\$([a-zA-Z][\w-]*)/g)) {
		const namespace = m[1];
		const varName = m[2];
		results.namespacedVariables.add(`${namespace}.$${varName}`);
	}

	for (const p of patterns.colors) {
		for (const m of content.matchAll(p)) {
			results.colors.add(normalizeColorToHex(m[0]));
		}
	}

	for (const m of content.matchAll(
		/:\s*(-?\d+(?:\.\d+)?(?:px|rem|em|ch|vw|vh|%))/g,
	)) {
		results.spacing.add(m[1]);
	}

	for (const m of content.matchAll(patterns.typography.fontFamily)) {
		results.fontFamilies.add(cleanCssValue(m[1]));
	}
	for (const m of content.matchAll(patterns.typography.fontSize)) {
		results.fontSizes.add(cleanCssValue(m[1]));
	}
	for (const m of content.matchAll(patterns.typography.fontWeight)) {
		results.fontWeights.add(cleanCssValue(m[1]));
	}
	for (const m of content.matchAll(patterns.typography.lineHeight)) {
		results.lineHeights.add(cleanCssValue(m[1]));
	}
	for (const m of content.matchAll(patterns.typography.letterSpacing)) {
		results.letterSpacings.add(cleanCssValue(m[1]));
	}

	for (const p of patterns.borders) {
		for (const m of content.matchAll(p)) {
			const val = cleanCssValue(m[1]);
			if (p.source.includes("radius")) {
				results.borderRadii.add(val);
			} else {
				results.borderWidths.add(val);
			}
		}
	}

	for (const p of patterns.shadows) {
		for (const m of content.matchAll(p)) {
			results.shadows.add(cleanCssValue(m[1]));
		}
	}

	for (const p of patterns.zIndex) {
		for (const m of content.matchAll(p)) {
			results.zIndices.add(m[1]);
		}
	}

	// Extract gradients
	for (const p of patterns.gradients) {
		for (const m of content.matchAll(p)) {
			results.gradients.add(cleanCssValue(m[0]));
		}
	}

	// Extract transitions
	for (const m of content.matchAll(patterns.transitions.transition)) {
		results.transitions.add(cleanCssValue(m[1]));
	}
	for (const m of content.matchAll(patterns.transitions.transitionDuration)) {
		results.transitions.add(cleanCssValue(m[1]));
	}

	// Extract animations
	for (const m of content.matchAll(patterns.animations.animation)) {
		results.animations.add(cleanCssValue(m[1]));
	}
	for (const m of content.matchAll(patterns.animations.animationName)) {
		results.animations.add(cleanCssValue(m[1]));
	}
	for (const m of content.matchAll(patterns.animations.animationDuration)) {
		results.animations.add(cleanCssValue(m[1]));
	}

	// Extract keyframe names
	for (const m of content.matchAll(patterns.keyframes)) {
		results.keyframes.add(m[1]);
	}

	// Extract transforms
	for (const p of patterns.transforms) {
		for (const m of content.matchAll(p)) {
			results.transforms.add(cleanCssValue(m[1]));
		}
	}

	// Extract filters
	for (const p of patterns.filters) {
		for (const m of content.matchAll(p)) {
			results.filters.add(cleanCssValue(m[1]));
		}
	}

	// Extract opacity values
	for (const p of patterns.opacity) {
		for (const m of content.matchAll(p)) {
			results.opacities.add(cleanCssValue(m[1]));
		}
	}

	// Extract cursor values
	for (const p of patterns.cursors) {
		for (const m of content.matchAll(p)) {
			results.cursors.add(m[1]);
		}
	}

	// Extract gap values
	for (const p of patterns.gaps) {
		for (const m of content.matchAll(p)) {
			results.gaps.add(cleanCssValue(m[1]));
		}
	}

	// Extract calc expressions
	for (const p of patterns.calc) {
		for (const m of content.matchAll(p)) {
			results.calcExpressions.add(m[0]);
		}
	}

	return results;
}

/**
 * @typedef {Object} MergedTokens
 * @property {Set<string>|string[]} colors
 * @property {Set<string>|string[]} spacing
 * @property {Set<string>|string[]} fontFamilies
 * @property {Set<string>|string[]} fontSizes
 * @property {Set<string>|string[]} fontWeights
 * @property {Set<string>|string[]} lineHeights
 * @property {Set<string>|string[]} letterSpacings
 * @property {Set<string>|string[]} borderRadii
 * @property {Set<string>|string[]} borderWidths
 * @property {Set<string>|string[]} shadows
 * @property {Set<string>|string[]} zIndices
 * @property {Set<string>|string[]} gradients
 * @property {Set<string>|string[]} transitions
 * @property {Set<string>|string[]} animations
 * @property {Set<string>|string[]} keyframes
 * @property {Set<string>|string[]} transforms
 * @property {Set<string>|string[]} filters
 * @property {Set<string>|string[]} opacities
 * @property {Set<string>|string[]} cursors
 * @property {Set<string>|string[]} gaps
 * @property {Set<string>|string[]} calcExpressions
 * @property {Set<string>|string[]} namespacedVariables
 * @property {Record<string, string>} variables
 * @property {string[]} sources
 */

/**
 * Merges multiple extraction results into one.
 * @param {ExtractedValues[]} styles - Array of extracted values
 * @returns {MergedTokens}
 */
const mergeResults = (styles = []) => {
	/** @type {MergedTokens} */
	const tokens = {
		colors: new Set(),
		spacing: new Set(),
		fontFamilies: new Set(),
		fontSizes: new Set(),
		fontWeights: new Set(),
		lineHeights: new Set(),
		letterSpacings: new Set(),
		borderRadii: new Set(),
		borderWidths: new Set(),
		shadows: new Set(),
		zIndices: new Set(),
		gradients: new Set(),
		transitions: new Set(),
		animations: new Set(),
		keyframes: new Set(),
		transforms: new Set(),
		filters: new Set(),
		opacities: new Set(),
		cursors: new Set(),
		gaps: new Set(),
		calcExpressions: new Set(),
		namespacedVariables: new Set(),
		variables: {},
		sources: [],
	};

	/**
	 * @param {Set<string>} record
	 * @returns {(entry: string) => void}
	 */
	const includeStyle = (record) => (entry) => {
		record.add(entry);
	};

	/**
	 * @param {ExtractedValues} options
	 * @param {MergedTokens} target
	 * @returns {(category: string) => void}
	 */
	const includeToken = (options, target) => (category) => {
		const sourceSet = options[/** @type {keyof ExtractedValues} */ (category)];
		const targetSet = target[/** @type {keyof MergedTokens} */ (category)];
		if (sourceSet instanceof Set && targetSet instanceof Set) {
			sourceSet.forEach(includeStyle(targetSet));
		}
	};

	/**
	 * @param {string[]} keys
	 * @param {MergedTokens} target
	 * @returns {(options: ExtractedValues) => void}
	 */
	const addCssStyles = (keys, target) => (options) => {
		keys.forEach(includeToken(options, target));
		Object.assign(target.variables, options.variables);
		target.sources.push(options.source);
	};

	/** @type {string[]} */
	const setKeys = Object.keys(tokens).filter(
		(key) => !["variables", "sources"].includes(key),
	);
	styles.forEach(addCssStyles(setKeys, tokens));

	/**
	 * @param {MergedTokens} target
	 * @returns {(key: string) => void}
	 */
	const sortCssStyle = (target) => (key) => {
		const entry = target[/** @type {keyof MergedTokens} */ (key)];
		target[/** @type {keyof MergedTokens} */ (key)] = /** @type {any} */ (
			(entry instanceof Set ? [...entry] : Object.values(entry)).sort()
		);
	};
	setKeys.forEach(sortCssStyle(tokens));

	return tokens;
};

const files = walkDirectory(path.resolve(dir), {
	extensions: [".scss", ".css"],
	ignore: config.ignore,
	excludePatterns,
});

const baseFiles = files.filter((f) => !isComponentFile(f, componentPatterns));
const componentFiles = files.filter((f) =>
	isComponentFile(f, componentPatterns),
);

if (!quiet) {
	console.log(
		`Found ${files.length} style files (${baseFiles.length} base, ${componentFiles.length} component)`,
	);
	if (excludePatterns.length)
		console.log(`Excluding: ${excludePatterns.join(", ")}`);
}

const baseResults = baseFiles.map((f) =>
	extractValues(fs.readFileSync(f, "utf8"), f),
);
const componentResults = componentFiles.map((f) =>
	extractValues(fs.readFileSync(f, "utf8"), f),
);

const base = mergeResults(baseResults);
const components = mergeResults(componentResults);

if (dryRun) {
	console.log("\n[DRY RUN] Would create:");
	console.log(`  ${outDir}/base.json`);
	console.log(`  ${outDir}/components.json`);
	console.log(`\nBase styles found:`);
	console.log(
		`  Colors: ${Array.isArray(base.colors) ? base.colors.length : base.colors.size}`,
	);
	console.log(`  Variables: ${Object.keys(base.variables).length}`);
	process.exit(0);
}

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "base.json"), JSON.stringify(base, null, 2));
fs.writeFileSync(path.join(outDir, "components.json"), JSON.stringify(components, null, 2));

if (!quiet) {
	console.log(`\nBase styles extracted:`);
	console.log(
		`  Colors: ${Array.isArray(base.colors) ? base.colors.length : base.colors.size}`,
	);
	console.log(
		`  Spacing: ${Array.isArray(base.spacing) ? base.spacing.length : base.spacing.size}`,
	);
	console.log(
		`  Font families: ${Array.isArray(base.fontFamilies) ? base.fontFamilies.length : base.fontFamilies.size}`,
	);
	console.log(
		`  Font sizes: ${Array.isArray(base.fontSizes) ? base.fontSizes.length : base.fontSizes.size}`,
	);
	console.log(`  Variables: ${Object.keys(base.variables).length}`);
	console.log(
		`  Namespaced Variables: ${Array.isArray(base.namespacedVariables) ? base.namespacedVariables.length : base.namespacedVariables.size}`,
	);
	console.log(
		`  Gradients: ${Array.isArray(base.gradients) ? base.gradients.length : base.gradients.size}`,
	);
	console.log(
		`  Transitions: ${Array.isArray(base.transitions) ? base.transitions.length : base.transitions.size}`,
	);
	console.log(
		`  Animations: ${Array.isArray(base.animations) ? base.animations.length : base.animations.size}`,
	);
	console.log(
		`  Keyframes: ${Array.isArray(base.keyframes) ? base.keyframes.length : base.keyframes.size}`,
	);
	console.log(
		`  Transforms: ${Array.isArray(base.transforms) ? base.transforms.length : base.transforms.size}`,
	);
	console.log(
		`  Filters: ${Array.isArray(base.filters) ? base.filters.length : base.filters.size}`,
	);
	console.log(
		`  Calc Expressions: ${Array.isArray(base.calcExpressions) ? base.calcExpressions.length : base.calcExpressions.size}`,
	);
	console.log(`\nSaved to ${outDir}/`);
}

if (verbose) {
	console.log("\nDetailed breakdown:");
	console.log(`  Base sources: ${base.sources.length}`);
	console.log(`  Component sources: ${components.sources.length}`);
}
