#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

import {
	categorizeHexColor,
	convertHexColorToHsl,
	getOutputDirectory,
	hasFlag,
	loadConfiguration,
} from "../index.js";

/**
 * @typedef {import('../helperUtils/config.js').Config} Config
 */

/** @type {Config} */
const config = await loadConfiguration();
const outDir = getOutputDirectory(process.argv, config, "./dist/");
const scanPath = path.join(outDir, "base.json");
const quiet = hasFlag(process.argv, ["-Q", "--quiet"]);
const verbose = hasFlag(process.argv, ["-V", "--verbose"]);

if (!fs.existsSync(scanPath)) {
	console.error("Run `tokenize scan` first to generate base.json");
	process.exit(1);
}

const scan = JSON.parse(fs.readFileSync(scanPath, "utf8"));

/**
 * @typedef {Object} ColorEntry
 * @property {string} value - Hex color value
 * @property {number} luminance - Lightness value (0-100)
 */

/**
 * @typedef {Record<string, ColorEntry[]>} ColorGroups
 */

/**
 * Sorts numbers in ascending order.
 * @param {number} a - First number
 * @param {number} b - Second number
 * @returns {number}
 */
const sortNumeric = (a, b) => a - b;

/**
 * Sorts color entries by luminance in descending order.
 * @param {ColorEntry} a - First color entry
 * @param {ColorEntry} b - Second color entry
 * @returns {number}
 */
const sortByLuminance = (a, b) => b.luminance - a.luminance;

/**
 * Checks if a value ends with 'px'.
 * @param {string} value - CSS value to check
 * @returns {boolean}
 */
const isPxValue = (value) => value.endsWith("px");

/**
 * Checks if a value ends with 'rem'.
 * @param {string} value - CSS value to check
 * @returns {boolean}
 */
const isRemValue = (value) => value.endsWith("rem");

/**
 * Checks if a value is a size unit (px or rem).
 * @param {string} value - CSS value to check
 * @returns {boolean}
 */
const isSizeUnit = (value) => isPxValue(value) || isRemValue(value);

/**
 * Checks if a string is a valid hex color.
 * @param {string} color - Color string to check
 * @returns {boolean}
 */
const isHexColor = (color) => color.startsWith("#") && color.length >= 7;

/**
 * Converts a CSS size value to pixels.
 * @param {string} value - CSS value (px or rem)
 * @returns {number}
 */
const toPixels = (value) =>
	isRemValue(value) ? parseFloat(value) * 16 : parseFloat(value);

/**
 * Converts a number to a pixel string.
 * @param {number} value - Numeric value
 * @returns {string}
 */
const toPxString = (value) => `${value}px`;

/**
 * Returns unique sorted values from an array.
 * @template T
 * @param {T[]} values - Array of values
 * @param {(a: T, b: T) => number} [compareFn] - Comparison function
 * @returns {T[]}
 */
const uniqueSorted = (values, compareFn = /** @type {any} */ (sortNumeric)) =>
	[...new Set(values)].sort(compareFn);

/**
 * Creates a range checker function.
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @returns {(value: number) => boolean}
 */
const inRange = (min, max) => (value) => value >= min && value <= max;

/**
 * Creates a spacing scale generator.
 * @param {number} base - Base spacing unit
 * @returns {(values: string[]) => Record<number, string>}
 */
const generateSpacingScale = (base) => (values) => {
	const pxValues = values
		.filter(isPxValue)
		.map(parseFloat)
		.filter(inRange(1, 200));

	/**
	 * @param {Record<number, string>} scale
	 * @returns {(value: number) => Record<number, string>}
	 */
	const assignStep = (scale) => (value) => {
		const step = Math.round(value / base);
		if (inRange(1, 50)(step)) {
			scale[step] = toPxString(value);
		}
		return scale;
	};

	return uniqueSorted(pxValues).reduce(
		(scale, value) => assignStep(scale)(value),
		/** @type {Record<number, string>} */ ({}),
	);
};

/**
 * Creates a type scale generator.
 * @param {string[]} names - Scale names (e.g., 'xs', 'sm', 'base')
 * @returns {(sizes: string[]) => Record<string, string>}
 */
const generateTypeScale = (names) => (sizes) => {
	const pxSizes = sizes
		.filter(isSizeUnit)
		.map(toPixels)
		.filter(inRange(10, 96));

	/**
	 * @param {Record<string, string>} scale
	 * @param {number} value
	 * @param {number} index
	 * @returns {Record<string, string>}
	 */
	const assignName = (scale, value, index) => {
		if (names[index]) {
			scale[names[index]] = toPxString(value);
		}
		return scale;
	};

	return uniqueSorted(pxSizes)
		.slice(0, names.length)
		.reduce(assignName, /** @type {Record<string, string>} */ ({}));
};

/**
 * Groups colors by hue category and sorts by luminance.
 * @param {string[]} colors - Array of color strings
 * @returns {ColorGroups}
 */
const groupColors = (colors) => {
	const hexColors = colors.filter(isHexColor);

	/**
	 * @param {string} color
	 * @returns {ColorEntry}
	 */
	const toColorEntry = (color) => ({
		value: color,
		luminance: convertHexColorToHsl(color).lightness,
	});

	/**
	 * @param {ColorGroups} groups
	 * @returns {(color: string) => ColorGroups}
	 */
	const addToGroup = (groups) => (color) => {
		const category = categorizeHexColor(color);
		groups[category] = groups[category] || [];
		groups[category].push(toColorEntry(color));
		return groups;
	};

	/**
	 * @param {ColorGroups} groups
	 * @returns {(category: string) => void}
	 */
	const sortGroup = (groups) => (category) => {
		groups[category].sort(sortByLuminance);
	};

	/** @type {ColorGroups} */
	const groups = hexColors.reduce(
		(acc, color) => addToGroup(acc)(color),
		/** @type {ColorGroups} */ ({}),
	);
	Object.keys(groups).forEach(sortGroup(groups));

	return groups;
};

const typeScaleNames = [
	"xs",
	"sm",
	"base",
	"md",
	"lg",
	"xl",
	"2xl",
	"3xl",
	"4xl",
	"5xl",
];
const lineHeightNames = [
	"tight",
	"snug",
	"normal",
	"relaxed",
	"loose",
	"spacious",
];
const letterSpacingNames = ["tight", "normal", "wide", "wider"];
const radiusNames = ["none", "sm", "md", "lg", "xl", "full"];
const shadowNames = ["sm", "md", "lg", "xl", "2xl"];
const zIndexNames = ["base", "dropdown", "sticky", "modal", "tooltip"];
/** @type {Record<number, string>} */
const weightMap = {
	100: "thin",
	200: "extralight",
	300: "light",
	400: "normal",
	500: "medium",
	600: "semibold",
	700: "bold",
	800: "extrabold",
	900: "black",
};

/**
 * Maps values to a named scale.
 * @param {string[]} names - Scale names
 * @returns {<T>(values: T[]) => Record<string, T>}
 */
const mapToScale = (names) => (values) => {
	/**
	 * @template T
	 * @param {Record<string, T>} scale
	 * @param {T} value
	 * @param {number} index
	 * @returns {Record<string, T>}
	 */
	const assignValue = (scale, value, index) => {
		if (names[index] && value !== undefined) {
			scale[names[index]] = value;
		}
		return scale;
	};
	return values
		.slice(0, names.length)
		.reduce(assignValue, /** @type {Record<string, any>} */ ({}));
};

/**
 * Maps color entries to a numeric scale (100-950).
 * @param {ColorEntry[]} colors - Array of color entries
 * @returns {Record<number, string>}
 */
const mapColorScale = (colors) => {
	const step = Math.floor(900 / Math.max(colors.length - 1, 1));
	/**
	 * @param {Record<number, string>} scale
	 * @param {ColorEntry} color
	 * @param {number} index
	 * @returns {Record<number, string>}
	 */
	const assignScale = (scale, color, index) => {
		scale[Math.min(100 + index * step, 950)] = color.value;
		return scale;
	};
	return colors.reduce(assignScale, /** @type {Record<number, string>} */ ({}));
};

/**
 * Builds color primitives from grouped colors.
 * @param {ColorGroups} colorGroups - Grouped colors by category
 * @returns {Record<string, Record<number, string>>}
 */
const buildColorPrimitives = (colorGroups) => {
	/**
	 * @param {Record<string, Record<number, string>>} primitives
	 * @returns {(entry: [string, ColorEntry[]]) => Record<string, Record<number, string>>}
	 */
	const addCategory =
		(primitives) =>
		([category, colors]) => {
			primitives[category] = mapColorScale(colors);
			return primitives;
		};
	return Object.entries(colorGroups).reduce(
		(acc, entry) => addCategory(acc)(entry),
		/** @type {Record<string, Record<number, string>>} */ ({}),
	);
};

/**
 * Builds font family tokens from an array of font families.
 * @param {string[]} families - Array of font family strings
 * @returns {Record<string, string>}
 */
const buildFontFamilies = (families) => {
	/**
	 * @param {number} index
	 * @returns {string}
	 */
	const getName = (index) =>
		index === 0 ? "primary" : index === 1 ? "secondary" : `family${index + 1}`;
	/**
	 * @param {Record<string, string>} scale
	 * @param {string} family
	 * @param {number} index
	 * @returns {Record<string, string>}
	 */
	const assignFamily = (scale, family, index) => {
		scale[getName(index)] = family;
		return scale;
	};
	return families
		.slice(0, 5)
		.reduce(assignFamily, /** @type {Record<string, string>} */ ({}));
};

/**
 * Builds font weight tokens from an array of weights.
 * @param {string[]} weights - Array of font weight values
 * @returns {Record<string, string>}
 */
const buildFontWeights = (weights) => {
	/**
	 * @param {Record<string, string>} scale
	 * @param {string} weight
	 * @returns {Record<string, string>}
	 */
	const assignWeight = (scale, weight) => {
		const num = parseInt(weight, 10);
		if (weightMap[num]) {
			scale[weightMap[num]] = weight;
		}
		return scale;
	};
	return weights.reduce(
		assignWeight,
		/** @type {Record<string, string>} */ ({}),
	);
};

const colorGroups = groupColors(scan.colors);
const spacingBase = config.spacingBase || 4;

const primitives = {
	color: buildColorPrimitives(colorGroups),
	spacing: generateSpacingScale(spacingBase)(scan.spacing),
	typography: {
		fontFamily: buildFontFamilies(scan.fontFamilies),
		fontSize: generateTypeScale(typeScaleNames)(scan.fontSizes),
		fontWeight: buildFontWeights(scan.fontWeights),
		lineHeight: mapToScale(lineHeightNames)(scan.lineHeights),
		letterSpacing: mapToScale(letterSpacingNames)(scan.letterSpacings),
	},
	border: {
		radius: mapToScale(radiusNames)(scan.borderRadii.filter(isSizeUnit)),
		width: {},
	},
	shadow: mapToScale(shadowNames)(scan.shadows),
	zIndex: mapToScale(zIndexNames)(scan.zIndices.map(Number).sort(sortNumeric)),
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
 * Converts an object to SCSS variable declarations.
 * @param {Record<string, unknown>} obj - Object to convert
 * @param {string} [prefix=''] - Prefix for variable names
 * @returns {string}
 */
const toScss = (obj, prefix = "") =>
	Object.entries(obj).reduce((out, [key, value]) => {
		const name = buildName(prefix, key);
		return typeof value === "object" && value !== null
			? `${out}${toScss(/** @type {Record<string, unknown>} */ (value), name)}`
			: `${out}$${name}: ${value};\n`;
	}, "");

/**
 * Converts an object to CSS custom property declarations.
 * @param {Record<string, unknown>} obj - Object to convert
 * @param {string} [prefix=''] - Prefix for property names
 * @returns {string}
 */
const toCss = (obj, prefix = "") =>
	Object.entries(obj).reduce((out, [key, value]) => {
		const name = buildName(prefix, key);
		return typeof value === "object" && value !== null
			? `${out}${toCss(/** @type {Record<string, unknown>} */ (value), name)}`
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
		write("primitives.json", JSON.stringify(data, null, 2)),
	scss: (data, write) =>
		write(
			"_primitives.scss",
			`// Auto-generated primitives\n\n${toScss(data)}`,
		),
	css: (data, write) =>
		write("primitives.css", `/* Auto-generated primitives */\n:root {\n${toCss(data)}}\n`),
};

const write = writeOutput(outDir);
/** @type {OutputFormat[]} */
const formats = /** @type {OutputFormat[]} */ (
	outputFormats.filter((format) => format in outputWriters)
);
formats.forEach((format) => {
	outputWriters[format](primitives, write);
});

if (!quiet) {
	console.log("Generated primitives:");
	console.log(`  Color groups: ${Object.keys(primitives.color).length}`);
	console.log(
		`  Spacing scale: ${Object.keys(primitives.spacing).length} steps`,
	);
	console.log(
		`  Font sizes: ${Object.keys(primitives.typography.fontSize).length}`,
	);
	console.log(`\nSaved to ${outDir}/primitives.*`);
}

if (verbose) {
	console.log("\nDetailed breakdown:");
	console.log(
		`  Colors by category: ${Object.entries(primitives.color)
			.map(([k, v]) => `${k}(${Object.keys(v).length})`)
			.join(", ")}`,
	);
}
