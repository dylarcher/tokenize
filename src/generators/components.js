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
const semanticPath = path.join(outDir, "semantic.json");
const quiet = hasFlag(process.argv, ["-Q", "--quiet"]);
const verbose = hasFlag(process.argv, ["-V", "--verbose"]);

if (!fs.existsSync(semanticPath)) {
	console.error("Run `tokenize tokens semantic` first");
	process.exit(1);
}

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
 * @typedef {Object} FeedbackVariant
 * @property {string} background - Background color
 * @property {string} border - Border color
 * @property {string} text - Text color
 */

/**
 * Builds a feedback variant with background, border, and text.
 * @param {string} type - Feedback type (success, error, warning, info)
 * @returns {FeedbackVariant}
 */
const buildFeedbackVariant = (type) => ({
	background: ref(`feedback.${type}.bg`),
	border: ref(`feedback.${type}.border`),
	text: ref(`feedback.${type}.text`),
});

/**
 * @typedef {Object} BadgeVariant
 * @property {string} background - Background color
 * @property {string} text - Text color
 */

/**
 * Builds a badge variant with background and text.
 * @param {string} type - Badge type (success, error, warning, info)
 * @returns {BadgeVariant}
 */
const buildBadgeVariant = (type) => ({
	background: ref(`feedback.${type}.bg`),
	text: ref(`feedback.${type}.text`),
});

/**
 * @typedef {'primary' | 'secondary' | 'ghost'} ButtonVariant
 */

/**
 * Builds button variant tokens.
 * @param {ButtonVariant} variant - Button variant type
 * @returns {Record<string, string> | undefined}
 */
const buildButtonVariant = (variant) => {
	const variants = {
		primary: {
			background: ref("interactive.primary.default"),
			backgroundHover: ref("interactive.primary.hover"),
			backgroundActive: ref("interactive.primary.active"),
			backgroundDisabled: ref("interactive.primary.disabled"),
			text: ref("text.inverse"),
			textDisabled: ref("text.disabled"),
			border: "transparent",
			borderRadius: ref("radius.medium"),
			paddingX: ref("spacing.inline.md"),
			paddingY: ref("spacing.inset.sm"),
			fontSize: ref("typography.body.fontSize"),
			fontWeight: ref("typography.heading.fontWeight"),
		},
		secondary: {
			background: "transparent",
			backgroundHover: ref("surface.secondary"),
			backgroundActive: ref("surface.tertiary"),
			text: ref("interactive.primary.default"),
			textHover: ref("interactive.primary.hover"),
			textDisabled: ref("text.disabled"),
			border: ref("border.default"),
			borderHover: ref("interactive.primary.default"),
			borderRadius: ref("radius.medium"),
			paddingX: ref("spacing.inline.md"),
			paddingY: ref("spacing.inset.sm"),
		},
		ghost: {
			background: "transparent",
			backgroundHover: ref("surface.secondary"),
			text: ref("text.primary"),
			textHover: ref("interactive.primary.default"),
			border: "transparent",
			borderRadius: ref("radius.medium"),
			paddingX: ref("spacing.inline.sm"),
			paddingY: ref("spacing.inset.sm"),
		},
	};
	return variants[variant];
};

const components = {
	button: {
		primary: buildButtonVariant("primary"),
		secondary: buildButtonVariant("secondary"),
		ghost: buildButtonVariant("ghost"),
	},
	input: {
		background: ref("surface.default"),
		backgroundDisabled: ref("surface.secondary"),
		text: ref("text.primary"),
		textPlaceholder: ref("text.tertiary"),
		textDisabled: ref("text.disabled"),
		border: ref("border.default"),
		borderHover: ref("border.strong"),
		borderFocus: ref("border.focus"),
		borderError: ref("feedback.error.border"),
		borderRadius: ref("radius.small"),
		paddingX: ref("spacing.inline.md"),
		paddingY: ref("spacing.inset.sm"),
		fontSize: ref("typography.body.fontSize"),
	},
	card: {
		background: ref("surface.default"),
		backgroundHover: ref("surface.secondary"),
		border: ref("border.subtle"),
		borderRadius: ref("radius.large"),
		shadow: ref("elevation.low"),
		shadowHover: ref("elevation.medium"),
		padding: ref("spacing.inset.lg"),
		gap: ref("spacing.stack.md"),
	},
	modal: {
		overlay: "rgba(0, 0, 0, 0.5)",
		background: ref("surface.default"),
		border: ref("border.subtle"),
		borderRadius: ref("radius.large"),
		shadow: ref("elevation.high"),
		padding: ref("spacing.inset.xl"),
		gap: ref("spacing.stack.lg"),
		zIndex: ref("layer.modal"),
	},
	tooltip: {
		background: ref("surface.inverse"),
		text: ref("text.inverse"),
		borderRadius: ref("radius.small"),
		padding: ref("spacing.inset.sm"),
		shadow: ref("elevation.medium"),
		zIndex: ref("layer.tooltip"),
		fontSize: ref("typography.caption.fontSize"),
	},
	badge: {
		default: { background: ref("surface.tertiary"), text: ref("text.primary") },
		success: buildBadgeVariant("success"),
		error: buildBadgeVariant("error"),
		warning: buildBadgeVariant("warning"),
		info: buildBadgeVariant("info"),
		borderRadius: ref("radius.pill"),
		paddingX: ref("spacing.inline.sm"),
		paddingY: ref("spacing.inset.xs"),
		fontSize: ref("typography.caption.fontSize"),
		fontWeight: ref("typography.heading.fontWeight"),
	},
	link: {
		text: ref("text.link"),
		textHover: ref("interactive.primary.hover"),
		textActive: ref("interactive.primary.active"),
		underline: "none",
		underlineHover: "underline",
	},
	avatar: {
		background: ref("surface.tertiary"),
		text: ref("text.secondary"),
		border: ref("border.subtle"),
		borderRadius: ref("radius.pill"),
		sizes: { sm: "24px", md: "32px", lg: "48px", xl: "64px" },
	},
	dropdown: {
		background: ref("surface.default"),
		border: ref("border.default"),
		borderRadius: ref("radius.medium"),
		shadow: ref("elevation.medium"),
		zIndex: ref("layer.dropdown"),
		item: {
			background: "transparent",
			backgroundHover: ref("surface.secondary"),
			backgroundActive: ref("surface.tertiary"),
			text: ref("text.primary"),
			textDisabled: ref("text.disabled"),
			padding: ref("spacing.inset.sm"),
		},
	},
	tabs: {
		border: ref("border.subtle"),
		tab: {
			text: ref("text.secondary"),
			textHover: ref("text.primary"),
			textActive: ref("interactive.primary.default"),
			borderActive: ref("interactive.primary.default"),
			padding: ref("spacing.inset.md"),
		},
		panel: { padding: ref("spacing.inset.lg") },
	},
	alert: {
		success: buildFeedbackVariant("success"),
		error: buildFeedbackVariant("error"),
		warning: buildFeedbackVariant("warning"),
		info: buildFeedbackVariant("info"),
		borderRadius: ref("radius.medium"),
		padding: ref("spacing.inset.md"),
	},
};

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
			? `${out}$${name}: s.$${
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
	json: (data, write) =>
		write("components.json", JSON.stringify(data, null, 2)),
	scss: (data, write) =>
		write(
			"_components.scss",
			`// Auto-generated component tokens\n@use "semantic" as s;\n\n${toScssRef(data)}`,
		),
	css: (data, write) =>
		write(
			"components.css",
			`/* Auto-generated component tokens */\n:root {\n${toCssRef(data)}}\n`,
		),
};

const write = writeOutput(outDir);
/** @type {OutputFormat[]} */
const formats = /** @type {OutputFormat[]} */ (
	outputFormats.filter((format) => format in outputWriters)
);
formats.forEach((format) => {
	outputWriters[format](components, write);
});

const componentNames = Object.keys(components);

if (!quiet) {
	console.log("Generated component tokens:");
	console.log(`  Components: ${componentNames.length}`);
	console.log(`  - ${componentNames.slice(0, 6).join(", ")}`);
	console.log(`  - ${componentNames.slice(6).join(", ")}`);
	console.log(`\nSaved to ${outDir}/components.*`);
}

if (verbose) {
	console.log("\nComponent details:");
	for (const name of componentNames) {
		const comp = components[/** @type {keyof typeof components} */ (name)];
		console.log(`  ${name}: ${Object.keys(comp).length} tokens`);
	}
}
