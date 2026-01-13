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
const outDir = getOutputDirectory(process.argv, config, "./tests/mocks/dist/.tmp");
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
		variables: {},
		source: filepath,
	};

	for (const m of content.matchAll(/\$([a-zA-Z][\w-]*)\s*:\s*([^;]+)/g)) {
		/** @type {string} */
		const varName = m[1];
		results.variables[varName] = m[2].trim();
	}

	for (const m of content.matchAll(/--([a-zA-Z][\w-]*)\s*:\s*([^;]+)/g)) {
		/** @type {string} */
		const cssVarName = m[1];
		results.variables[cssVarName] = m[2].trim();
	}

	for (const p of patterns.colors) {
		for (const m of content.matchAll(p)) {
			results.colors.add(normalizeColorToHex(m[0]));
		}
	}

	for (const m of content.matchAll(/:\s*(-?\d+(?:\.\d+)?(?:px|rem|em))/g)) {
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
const componentFiles = files.filter((f) => isComponentFile(f, componentPatterns));

if (!quiet) {
	console.log(
		`Found ${files.length} style files (${baseFiles.length} base, ${componentFiles.length} component)`,
	);
	if (excludePatterns.length) console.log(`Excluding: ${excludePatterns.join(", ")}`);
}

const baseResults = baseFiles.map((f) => extractValues(fs.readFileSync(f, "utf8"), f));
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
	console.log(`  Colors: ${Array.isArray(base.colors) ? base.colors.length : base.colors.size}`);
	console.log(`  Variables: ${Object.keys(base.variables).length}`);
	process.exit(0);
}

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "base.json"), JSON.stringify(base, null, 2));
fs.writeFileSync(
	path.join(outDir, "components.json"),
	JSON.stringify(components, null, 2),
);

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
	console.log(`\nSaved to ${outDir}/`);
}

if (verbose) {
	console.log("\nDetailed breakdown:");
	console.log(`  Base sources: ${base.sources.length}`);
	console.log(`  Component sources: ${components.sources.length}`);
}
