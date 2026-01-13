#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

import { getOutputDirectory, hasFlag, loadConfiguration } from "../index.js";

/**
 * @typedef {import('../helperUtils/config.js').Config} Config
 */

/** @type {Config} */
const config = await loadConfiguration();
const outDir = getOutputDirectory(process.argv, config, "./dist/");
const primitivesPath = path.join(outDir, "primitives.json");
const quiet = hasFlag(process.argv, ["-Q", "--quiet"]);
const verbose = hasFlag(process.argv, ["-V", "--verbose"]);

if (!fs.existsSync(primitivesPath)) {
	console.error("Run `tokenize tokens primitives` first");
	process.exit(1);
}

const primitives = JSON.parse(fs.readFileSync(primitivesPath, "utf8"));

/**
 * Sorts numbers in ascending order.
 * @param {number} a - First number
 * @param {number} b - Second number
 * @returns {number}
 */
const sortNumeric = (a, b) => a - b;

/**
 * Creates a token reference string.
 * @param {string} tokenPath - Token path
 * @returns {string}
 */
const ref = (tokenPath) => `{${tokenPath}}`;

/**
 * Checks if a value is a token reference.
 * @param {unknown} value - Value to check
 * @returns {boolean}
 */
const isRef = (value) => typeof value === "string" && value.startsWith("{");

/**
 * Gets sorted numeric keys from an object.
 * @param {Record<string, unknown>} [obj={}] - Object to get keys from
 * @returns {number[]}
 */
const getSortedKeys = (obj = {}) =>
	Object.keys(obj).map(Number).sort(sortNumeric);

/**
 * Gets a key at a specific index with fallback.
 * @param {number[]} keys - Array of keys
 * @param {number} index - Index to get
 * @param {number} [fallback] - Fallback value
 * @returns {number}
 */
const getKeyAt = (keys, index, fallback) => keys[index] ?? fallback ?? keys[0];

/**
 * Gets the middle index of an array.
 * @param {number[]} keys - Array of keys
 * @returns {number}
 */
const getMiddleIndex = (keys) => Math.floor(keys.length / 2);

/**
 * Creates a color reference builder for a category.
 * @param {string} category - Color category
 * @returns {(scale: number) => string}
 */
const buildColorRef = (category) => (scale) =>
	ref(`color.${category}.${scale}`);

const neutrals = primitives.color.neutral || {};
const neutralKeys = getSortedKeys(neutrals);
const lightest = getKeyAt(neutralKeys, 0);
const darkest = getKeyAt(neutralKeys, neutralKeys.length - 1);
const mid = getKeyAt(neutralKeys, getMiddleIndex(neutralKeys));

const neutralRef = buildColorRef("neutral");

const colorCategories = Object.keys(primitives.color).filter(
	(c) => c !== "neutral",
);
const primary = colorCategories[0] || "blue";
const primaryKeys = getSortedKeys(primitives.color[primary] || {});
const primaryMid = getKeyAt(primaryKeys, getMiddleIndex(primaryKeys));
const primaryRef = buildColorRef(primary);

/**
 * @typedef {Object} InteractiveStates
 * @property {string} default - Default state color
 * @property {string} hover - Hover state color
 * @property {string} active - Active state color
 * @property {string} disabled - Disabled state color
 */

/**
 * Builds interactive state tokens for a color category.
 * @param {string} category - Color category
 * @param {number[]} keys - Color scale keys
 * @returns {InteractiveStates}
 */
const buildInteractiveStates = (category, keys) => {
	const midIndex = getMiddleIndex(keys);
	const colorRef = buildColorRef(category);
	return {
		default: colorRef(getKeyAt(keys, midIndex)),
		hover: colorRef(getKeyAt(keys, midIndex + 1, keys[keys.length - 1])),
		active: colorRef(getKeyAt(keys, keys.length - 1)),
		disabled: neutralRef(mid),
	};
};

/**
 * @typedef {Object} FeedbackTokens
 * @property {string} bg - Background color
 * @property {string} border - Border color
 * @property {string} text - Text color
 */

/**
 * Creates a feedback token builder.
 * @param {Record<string, string>} feedbackMap - Map of color names to semantic names
 * @returns {(colors: Record<string, Record<number, string>>) => Record<string, FeedbackTokens>}
 */
const buildFeedbackTokens = (feedbackMap) => (colors) => {
	/**
	 * @param {Record<string, FeedbackTokens>} feedback
	 * @returns {(entry: [string, string]) => Record<string, FeedbackTokens>}
	 */
	const createFeedback =
		(feedback) =>
		([colorName, semanticName]) => {
			if (!colors[colorName]) return feedback;
			const keys = getSortedKeys(colors[colorName]);
			const colorRef = buildColorRef(colorName);
			feedback[semanticName] = {
				bg: colorRef(getKeyAt(keys, 0)),
				border: colorRef(getKeyAt(keys, Math.floor(keys.length / 3))),
				text: colorRef(getKeyAt(keys, keys.length - 1)),
			};
			return feedback;
		};
	return Object.entries(feedbackMap).reduce((acc, entry) => createFeedback(acc)(entry), {});
};

const feedbackMap = {
	green: "success",
	red: "error",
	yellow: "warning",
	orange: "caution",
	blue: "info",
};

/**
 * Builds secondary interactive tokens if available.
 * @param {string[]} categories - Color categories
 * @param {Record<string, Record<number, string>>} colors - Color primitives
 * @returns {InteractiveStates | null}
 */
const buildSecondaryInteractive = (categories, colors) => {
	if (!categories[1]) return null;
	const secondary = categories[1];
	const secKeys = getSortedKeys(colors[secondary] || {});
	return buildInteractiveStates(secondary, secKeys);
};

/** @type {{ surface: Record<string, string>, text: Record<string, string>, border: Record<string, string>, interactive: { primary: InteractiveStates, secondary?: InteractiveStates }, feedback: Record<string, FeedbackTokens>, typography: Record<string, Record<string, string>>, spacing: Record<string, Record<string, string>>, elevation: Record<string, string>, radius: Record<string, string>, layer: Record<string, string> }} */
const semantic = {
	surface: {
		default: neutralRef(lightest),
		secondary: neutralRef(getKeyAt(neutralKeys, 1, lightest)),
		tertiary: neutralRef(getKeyAt(neutralKeys, 2, mid)),
		inverse: neutralRef(darkest),
	},
	text: {
		primary: neutralRef(darkest),
		secondary: neutralRef(
			getKeyAt(neutralKeys, neutralKeys.length - 2, darkest),
		),
		tertiary: neutralRef(mid),
		inverse: neutralRef(lightest),
		disabled: neutralRef(mid),
		link: primaryRef(primaryMid),
	},
	border: {
		default: neutralRef(getKeyAt(neutralKeys, 2, mid)),
		subtle: neutralRef(getKeyAt(neutralKeys, 1, lightest)),
		strong: neutralRef(getKeyAt(neutralKeys, neutralKeys.length - 2, darkest)),
		focus: primaryRef(primaryMid),
	},
	interactive: {
		primary: buildInteractiveStates(primary, primaryKeys),
	},
	feedback: buildFeedbackTokens(feedbackMap)(primitives.color),
	typography: {
		body: {
			fontFamily: ref("typography.fontFamily.primary"),
			fontSize: ref("typography.fontSize.base"),
			lineHeight: ref("typography.lineHeight.normal"),
			fontWeight: ref("typography.fontWeight.normal"),
		},
		heading: {
			fontFamily: ref("typography.fontFamily.primary"),
			fontWeight: ref("typography.fontWeight.bold"),
		},
		caption: {
			fontFamily: ref("typography.fontFamily.primary"),
			fontSize: ref("typography.fontSize.sm"),
			lineHeight: ref("typography.lineHeight.tight"),
		},
	},
	spacing: {
		inset: {
			xs: ref("spacing.1"),
			sm: ref("spacing.2"),
			md: ref("spacing.4"),
			lg: ref("spacing.6"),
			xl: ref("spacing.8"),
		},
		stack: {
			xs: ref("spacing.1"),
			sm: ref("spacing.2"),
			md: ref("spacing.4"),
			lg: ref("spacing.6"),
			xl: ref("spacing.8"),
		},
		inline: {
			xs: ref("spacing.1"),
			sm: ref("spacing.2"),
			md: ref("spacing.4"),
			lg: ref("spacing.6"),
		},
	},
	elevation: {
		none: "none",
		low: ref("shadow.sm"),
		medium: ref("shadow.md"),
		high: ref("shadow.lg"),
	},
	radius: {
		none: "0",
		small: ref("border.radius.sm"),
		medium: ref("border.radius.md"),
		large: ref("border.radius.lg"),
		pill: ref("border.radius.full"),
	},
	layer: {
		base: ref("zIndex.base"),
		dropdown: ref("zIndex.dropdown"),
		sticky: ref("zIndex.sticky"),
		modal: ref("zIndex.modal"),
		tooltip: ref("zIndex.tooltip"),
	},
};

const secondaryInteractive = buildSecondaryInteractive(
	colorCategories,
	primitives.color,
);
if (secondaryInteractive) {
	semantic.interactive.secondary = secondaryInteractive;
}

const outputFormats = config.outputFormats || ["json", "scss", "css"];

/**
 * Builds a prefixed token name.
 * @param {string} prefix - Prefix string
 * @param {string} key - Key name
 * @returns {string}
 */
const buildName = (prefix, key) => (prefix ? `${prefix}-${key}` : key);

/**
 * Converts an object to SCSS variable declarations with references.
 * @param {Record<string, unknown>} obj - Object to convert
 * @param {string} [prefix=''] - Prefix for variable names
 * @returns {string}
 */
const toScssRef = (obj, prefix = "") =>
	Object.entries(obj).reduce((out, [key, value]) => {
		const name = buildName(prefix, key);
		if (typeof value === "object" && value !== null) {
			return `${out}${toScssRef(/** @type {Record<string, unknown>} */ (value), name)}`;
		}
		return isRef(value)
			? `${out}$${name}: p.$${
					/** @type {string} */ (value)
						.slice(1, -1)
						.replace(/\./g, "-")
				};\n`
			: `${out}$${name}: ${value};\n`;
	}, "");

/**
 * Converts an object to CSS custom property declarations with references.
 * @param {Record<string, unknown>} obj - Object to convert
 * @param {string} [prefix=''] - Prefix for property names
 * @returns {string}
 */
const toCssRef = (obj, prefix = "") =>
	Object.entries(obj).reduce((out, [key, value]) => {
		const name = buildName(prefix, key);
		if (typeof value === "object" && value !== null) {
			return `${out}${toCssRef(/** @type {Record<string, unknown>} */ (value), name)}`;
		}
		return isRef(value)
			? `${out}  --${name}: var(--${
					/** @type {string} */ (value)
						.slice(1, -1)
						.replace(/\./g, "-")
				});\n`
			: `${out}  --${name}: ${value};\n`;
	}, "");

/**
 * @typedef {(filename: string, content: string) => void} WriteFunction
 */

/**
 * Creates a file writer for a directory.
 * @param {string} directory - Output directory
 * @returns {WriteFunction}
 */
const writeOutput = (directory) => (filename, content) =>
	fs.writeFileSync(path.join(directory, filename), content);

/**
 * @typedef {'json' | 'scss' | 'css'} OutputFormat
 */

/** @type {Record<OutputFormat, (data: Record<string, unknown>, write: WriteFunction) => void>} */
const outputWriters = {
	json: (data, write) => write("semantic.json", JSON.stringify(data, null, 2)),
	scss: (data, write) =>
		write(
			"_semantic.scss",
			`// Auto-generated semantic tokens\n@use "primitives" as p;\n\n${toScssRef(data)}`,
		),
	css: (data, write) =>
		write(
			"semantic.css",
			`/* Auto-generated semantic tokens */\n:root {\n${toCssRef(data)}}\n`,
		),
};

const write = writeOutput(outDir);
/** @type {OutputFormat[]} */
const formats = /** @type {OutputFormat[]} */ (
	outputFormats.filter((format) => format in outputWriters)
);
formats.forEach((format) => {
	outputWriters[format](semantic, write);
});

if (!quiet) {
	console.log("Generated semantic tokens:");
	console.log(`  Surface: ${Object.keys(semantic.surface).length}`);
	console.log(`  Text: ${Object.keys(semantic.text).length}`);
	console.log(`  Interactive: ${Object.keys(semantic.interactive).length}`);
	console.log(`  Feedback: ${Object.keys(semantic.feedback).length}`);
	console.log(`\nSaved to ${outDir}/semantic.*`);
}

if (verbose) {
	console.log("\nToken references:");
	console.log(`  Primary color: ${primary}`);
	console.log(`  Color categories: ${colorCategories.join(", ")}`);
}
