#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

import { getFlagValue, hasFlag } from "../index.js";

/**
 * @typedef {import('../helperUtils/config.js').Config} Config
 */

const verbose = hasFlag(process.argv, ["-V", "--verbose"]);
const quiet = hasFlag(process.argv, ["-Q", "--quiet"]);
const dryRun = hasFlag(process.argv, ["-N", "--dry-run"]);
const inputFile = getFlagValue(process.argv, ["-i", "--input"]);
const outputFile = getFlagValue(process.argv, ["-o", "--output"]);

const usage = `
Usage: tokenize format [options]

Convert token files between legacy (value/type) and DTCG ($value/$type) formats.

Options:
  -i, --input <file>     Input token file (JSON)
  -o, --output <file>    Output file path (defaults to input with .dtcg.json suffix)
  --to-dtcg              Convert to DTCG format ($value/$type) [default]
  --to-legacy            Convert to legacy format (value/type)
  --normalize-refs       Normalize reference syntax to {token.path}
  -V, --verbose          Verbose output
  -Q, --quiet            Suppress output
  -N, --dry-run          Preview without writing files
  -h, --help             Show this help message

Examples:
  tokenize format -i tokens.json -o tokens.dtcg.json
  tokenize format -i figma-export.json --to-dtcg
  tokenize format -i tokens.dtcg.json --to-legacy
`;

if (hasFlag(process.argv, ["-h", "--help"])) {
	console.log(usage);
	process.exit(0);
}

const toDtcg = !hasFlag(process.argv, ["--to-legacy"]);
const normalizeRefs = hasFlag(process.argv, ["--normalize-refs"]);

/**
 * Checks if an object is a token leaf node (has value/type or $value/$type).
 * @param {unknown} obj - Object to check
 * @returns {boolean}
 */
const isTokenNode = (obj) => {
	if (typeof obj !== "object" || obj === null) return false;
	const o = /** @type {Record<string, unknown>} */ (obj);
	return ("$value" in o && "$type" in o) || ("value" in o && "type" in o);
};

/**
 * Normalizes reference syntax to {token.path} format.
 * Handles various formats:
 * - {color.primary} -> {color.primary}
 * - $color.primary -> {color.primary}
 * - var(--color-primary) -> {color.primary}
 * @param {string} value - Value to normalize
 * @returns {string}
 */
const normalizeReference = (value) => {
	if (typeof value !== "string") return value;

	// Already in correct format
	if (/^\{[^}]+\}$/.test(value)) return value;

	// $token.path format
	if (value.startsWith("$") && !value.startsWith("$value")) {
		return `{${value.slice(1)}}`;
	}

	// var(--token-path) format
	const varMatch = value.match(/var\(--([^)]+)\)/);
	if (varMatch) {
		const tokenPath = varMatch[1].replace(/-/g, ".");
		return `{${tokenPath}}`;
	}

	return value;
};

/**
 * Converts a token node between formats.
 * @param {Record<string, unknown>} node - Token node
 * @param {boolean} toDtcgFormat - Whether to convert to DTCG format
 * @returns {Record<string, unknown>}
 */
const convertTokenNode = (node, toDtcgFormat) => {
	/** @type {Record<string, unknown>} */
	const result = {};

	// Get the value and type from either format
	const value = node.$value ?? node.value;
	const type = node.$type ?? node.type;
	const description = node.$description ?? node.description;

	// Convert value if it's a reference
	let convertedValue = value;
	if (normalizeRefs && typeof value === "string") {
		convertedValue = normalizeReference(value);
	}

	if (toDtcgFormat) {
		result.$value = convertedValue;
		result.$type = type;
		if (description) result.$description = description;
	} else {
		result.value = convertedValue;
		result.type = type;
		if (description) result.description = description;
	}

	// Copy any additional properties (extensions, etc.)
	for (const [key, val] of Object.entries(node)) {
		if (
			![
				"$value",
				"$type",
				"$description",
				"value",
				"type",
				"description",
			].includes(key)
		) {
			result[key] = val;
		}
	}

	return result;
};

/**
 * Recursively converts a token object tree.
 * @param {unknown} obj - Object to convert
 * @param {boolean} toDtcgFormat - Whether to convert to DTCG format
 * @returns {unknown}
 */
const convertTokenTree = (obj, toDtcgFormat) => {
	if (typeof obj !== "object" || obj === null) return obj;

	if (isTokenNode(obj)) {
		return convertTokenNode(
			/** @type {Record<string, unknown>} */ (obj),
			toDtcgFormat,
		);
	}

	/** @type {Record<string, unknown>} */
	const result = {};
	for (const [key, value] of Object.entries(obj)) {
		result[key] = convertTokenTree(value, toDtcgFormat);
	}
	return result;
};

/**
 * Counts tokens in an object tree.
 * @param {unknown} obj - Object to count
 * @returns {number}
 */
const countTokens = (obj) => {
	if (typeof obj !== "object" || obj === null) return 0;
	if (isTokenNode(obj)) return 1;

	let count = 0;
	for (const value of Object.values(obj)) {
		count += countTokens(value);
	}
	return count;
};

// Main execution
if (!inputFile) {
	console.error("Error: Input file is required. Use -i or --input to specify.");
	console.log(usage);
	process.exit(1);
}

const inputPath = path.resolve(inputFile);
if (!fs.existsSync(inputPath)) {
	console.error(`Error: Input file not found: ${inputPath}`);
	process.exit(1);
}

const outputPath = outputFile
	? path.resolve(outputFile)
	: inputPath.replace(/\.json$/, toDtcg ? ".dtcg.json" : ".legacy.json");

if (!quiet) {
	console.log(
		`\nConverting tokens ${toDtcg ? "to DTCG" : "to legacy"} format...`,
	);
	console.log(`  Input:  ${inputPath}`);
	console.log(`  Output: ${outputPath}`);
	if (normalizeRefs) console.log(`  Normalizing references: enabled`);
}

try {
	const inputContent = fs.readFileSync(inputPath, "utf8");
	const tokens = JSON.parse(inputContent);

	const tokenCount = countTokens(tokens);
	if (verbose) console.log(`  Found ${tokenCount} tokens`);

	const converted = convertTokenTree(tokens, toDtcg);

	if (dryRun) {
		console.log("\n[DRY RUN] Would write:");
		console.log(`${JSON.stringify(converted, null, 2).slice(0, 500)}...`);
		process.exit(0);
	}

	fs.mkdirSync(path.dirname(outputPath), { recursive: true });
	fs.writeFileSync(outputPath, JSON.stringify(converted, null, 2));

	if (!quiet) {
		console.log(`\n✓ Converted ${tokenCount} tokens`);
		console.log(`  Output: ${outputPath}`);
	}
} catch (error) {
	console.error(
		`Error: ${error instanceof Error ? error.message : String(error)}`,
	);
	process.exit(1);
}
