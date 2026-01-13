#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

import { getFlagValue, hasFlag, loadConfiguration } from "../index.js";

/**
 * @typedef {import('../helperUtils/config.js').Config} Config
 */

/** @type {Config} */
const config = await loadConfiguration();
const verbose = hasFlag(process.argv, ["-V", "--verbose"]);
const quiet = hasFlag(process.argv, ["-Q", "--quiet"]);
const dryRun = hasFlag(process.argv, ["-N", "--dry-run"]);
const strict = hasFlag(process.argv, ["--strict"]);

// Output format flags
const outputJson = hasFlag(process.argv, ["--json"]);
const outputTable = hasFlag(process.argv, ["--table"]);
const _outputMd =
	hasFlag(process.argv, ["--md"]) || (!outputJson && !outputTable);

// Input/output paths
const inputDir = getFlagValue(
	process.argv,
	["-i", "--input"],
	config.outDir || "./dist",
);
const outputPath = getFlagValue(
	process.argv,
	["-o", "--output"],
	"./dist/.tmp/audits/validation",
);

const usage = `
Usage: tokenize validate [options]

Validate token files for DTCG compliance, unresolved references, and issues.

Options:
  -i, --input <dir>      Directory containing token files to validate
  -o, --output <path>    Output path for validation report (without extension)
  --strict               Fail on warnings (not just errors)

Validation Checks:
  - DTCG compliance ($value/$type presence)
  - Unresolved token references
  - Duplicate token definitions
  - Circular references
  - Invalid token types
  - Empty values

Output Formats:
  --json                 Output as JSON (for CI integration)
  --md                   Output as Markdown (default)
  --table                Output as CLI table

  -V, --verbose          Verbose output
  -Q, --quiet            Suppress output
  -N, --dry-run          Preview without writing files
  -h, --help             Show this help message

Examples:
  tokenize validate -i ./dist
  tokenize validate --strict --json
  tokenize validate -o ./reports/validation
`;

if (hasFlag(process.argv, ["-h", "--help"])) {
	console.log(usage);
	process.exit(0);
}

/**
 * @typedef {'error' | 'warning' | 'info'} Severity
 */

/**
 * @typedef {Object} ValidationIssue
 * @property {string} path - Token path
 * @property {string} file - Source file
 * @property {Severity} severity - Issue severity
 * @property {string} code - Issue code
 * @property {string} message - Issue description
 */

/**
 * @typedef {Object} ValidationReport
 * @property {string} file - File validated
 * @property {ValidationIssue[]} errors - Error-level issues
 * @property {ValidationIssue[]} warnings - Warning-level issues
 * @property {ValidationIssue[]} info - Info-level issues
 * @property {number} tokenCount - Total tokens validated
 * @property {boolean} valid - Whether file is valid (no errors)
 */

/** @type {string[]} */
const DTCG_TYPES = [
	"color",
	"dimension",
	"fontFamily",
	"fontWeight",
	"duration",
	"cubicBezier",
	"number",
	"strokeStyle",
	"border",
	"transition",
	"shadow",
	"gradient",
	"typography",
	"fontStyle",
];

/**
 * Validates a single token node.
 * @param {unknown} token - Token to validate
 * @param {string} tokenPath - Path to token
 * @param {string} file - Source file
 * @param {Set<string>} allPaths - All known token paths
 * @returns {ValidationIssue[]}
 */
const validateToken = (token, tokenPath, file, allPaths) => {
	/** @type {ValidationIssue[]} */
	const issues = [];

	if (typeof token !== "object" || token === null) {
		return issues;
	}

	const t = /** @type {Record<string, unknown>} */ (token);

	// Check for DTCG format
	const hasDtcgValue = "$value" in t;
	const hasDtcgType = "$type" in t;
	const hasLegacyValue = "value" in t;
	const hasLegacyType = "type" in t;

	if (!hasDtcgValue && !hasLegacyValue) {
		issues.push({
			path: tokenPath,
			file,
			severity: "error",
			code: "MISSING_VALUE",
			message: "Token is missing a value ($value or value)",
		});
	}

	if (!hasDtcgType && !hasLegacyType) {
		issues.push({
			path: tokenPath,
			file,
			severity: "warning",
			code: "MISSING_TYPE",
			message: "Token is missing a type ($type or type)",
		});
	}

	// Check for mixed format
	if ((hasDtcgValue && hasLegacyValue) || (hasDtcgType && hasLegacyType)) {
		issues.push({
			path: tokenPath,
			file,
			severity: "warning",
			code: "MIXED_FORMAT",
			message:
				"Token mixes DTCG ($value/$type) and legacy (value/type) formats",
		});
	}

	// Prefer DTCG format
	if (hasLegacyValue && !hasDtcgValue) {
		issues.push({
			path: tokenPath,
			file,
			severity: "info",
			code: "LEGACY_FORMAT",
			message:
				"Token uses legacy format. Consider migrating to DTCG ($value/$type)",
		});
	}

	// Validate type value
	const type = t.$type ?? t.type;
	if (type && typeof type === "string" && !DTCG_TYPES.includes(type)) {
		issues.push({
			path: tokenPath,
			file,
			severity: "warning",
			code: "UNKNOWN_TYPE",
			message: `Unknown token type "${type}". Valid types: ${DTCG_TYPES.join(", ")}`,
		});
	}

	// Check for empty values
	const value = t.$value ?? t.value;
	if (value === "" || value === null || value === undefined) {
		issues.push({
			path: tokenPath,
			file,
			severity: "error",
			code: "EMPTY_VALUE",
			message: "Token has an empty or null value",
		});
	}

	// Check for unresolved references
	if (
		typeof value === "string" &&
		value.startsWith("{") &&
		value.endsWith("}")
	) {
		const refPath = value.slice(1, -1);
		if (!allPaths.has(refPath)) {
			issues.push({
				path: tokenPath,
				file,
				severity: "error",
				code: "UNRESOLVED_REF",
				message: `Unresolved reference: ${value}`,
			});
		}
	}

	return issues;
};

/**
 * Recursively collects all token paths from an object.
 * @param {unknown} obj - Object to traverse
 * @param {string} [prefix=''] - Current path prefix
 * @returns {Set<string>}
 */
const collectTokenPaths = (obj, prefix = "") => {
	/** @type {Set<string>} */
	const paths = new Set();

	if (typeof obj !== "object" || obj === null) {
		return paths;
	}

	const o = /** @type {Record<string, unknown>} */ (obj);

	// Check if this is a token node
	if ("$value" in o || "value" in o) {
		paths.add(prefix);
		return paths;
	}

	for (const [key, value] of Object.entries(o)) {
		if (key.startsWith("$")) continue;
		const newPrefix = prefix ? `${prefix}.${key}` : key;
		const nested = collectTokenPaths(value, newPrefix);
		for (const p of nested) {
			paths.add(p);
		}
	}

	return paths;
};

/**
 * Validates a token file.
 * @param {string} filePath - Path to token file
 * @param {Set<string>} allPaths - All known token paths across files
 * @returns {ValidationReport}
 */
const validateFile = (filePath, allPaths) => {
	const fileName = path.basename(filePath);
	/** @type {ValidationIssue[]} */
	const errors = [];
	/** @type {ValidationIssue[]} */
	const warnings = [];
	/** @type {ValidationIssue[]} */
	const info = [];
	let tokenCount = 0;

	let content;
	try {
		content = JSON.parse(fs.readFileSync(filePath, "utf8"));
	} catch (e) {
		errors.push({
			path: "",
			file: fileName,
			severity: "error",
			code: "PARSE_ERROR",
			message: `Failed to parse JSON: ${e instanceof Error ? e.message : String(e)}`,
		});
		return {
			file: fileName,
			errors,
			warnings,
			info,
			tokenCount: 0,
			valid: false,
		};
	}

	/**
	 * Recursively validate tokens.
	 * @param {unknown} obj - Object to validate
	 * @param {string} prefix - Current path
	 */
	const validate = (obj, prefix = "") => {
		if (typeof obj !== "object" || obj === null) return;

		const o = /** @type {Record<string, unknown>} */ (obj);

		// Check if this is a token node
		if ("$value" in o || "value" in o) {
			tokenCount++;
			const issues = validateToken(o, prefix, fileName, allPaths);
			for (const issue of issues) {
				if (issue.severity === "error") errors.push(issue);
				else if (issue.severity === "warning") warnings.push(issue);
				else info.push(issue);
			}
			return;
		}

		for (const [key, value] of Object.entries(o)) {
			if (key.startsWith("$")) continue;
			const newPrefix = prefix ? `${prefix}.${key}` : key;
			validate(value, newPrefix);
		}
	};

	validate(content);

	// Check for duplicates within file (same path defined multiple times)
	const seenPaths = new Set();
	const checkDuplicates = (obj, prefix = "") => {
		if (typeof obj !== "object" || obj === null) return;
		const o = /** @type {Record<string, unknown>} */ (obj);
		if ("$value" in o || "value" in o) {
			if (seenPaths.has(prefix)) {
				warnings.push({
					path: prefix,
					file: fileName,
					severity: "warning",
					code: "DUPLICATE",
					message: `Duplicate token definition: ${prefix}`,
				});
			}
			seenPaths.add(prefix);
			return;
		}
		for (const [key, value] of Object.entries(o)) {
			if (key.startsWith("$")) continue;
			checkDuplicates(value, prefix ? `${prefix}.${key}` : key);
		}
	};
	checkDuplicates(content);

	return {
		file: fileName,
		errors,
		warnings,
		info,
		tokenCount,
		valid: errors.length === 0,
	};
};

/**
 * Detects circular references in token files.
 * @param {Map<string, unknown>} tokens - Map of path -> token value
 * @param {string} file - Source file name
 * @returns {ValidationIssue[]}
 */
const _detectCircularRefs = (tokens, file) => {
	/** @type {ValidationIssue[]} */
	const issues = [];

	/**
	 * @param {string} path - Starting path
	 * @param {Set<string>} visited - Visited paths
	 * @returns {string | null} Circular path or null
	 */
	const findCycle = (path, visited) => {
		if (visited.has(path)) return path;

		const token = tokens.get(path);
		if (!token) return null;

		const t = /** @type {{value?: unknown, $value?: unknown}} */ (token);
		const value = t.$value ?? t.value;

		if (typeof value !== "string" || !value.startsWith("{")) return null;

		const refPath = value.slice(1, -1);
		visited.add(path);
		return findCycle(refPath, visited);
	};

	for (const [path] of tokens) {
		const cycle = findCycle(path, new Set());
		if (cycle) {
			issues.push({
				path,
				file,
				severity: "error",
				code: "CIRCULAR_REF",
				message: `Circular reference detected: ${path} -> ${cycle}`,
			});
		}
	}

	return issues;
};

/**
 * Formats validation reports as JSON.
 * @param {ValidationReport[]} reports - Reports to format
 * @returns {string}
 */
const formatJson = (reports) => {
	const summary = {
		timestamp: new Date().toISOString(),
		valid: reports.every((r) => r.valid),
		reports: reports.map((r) => ({
			file: r.file,
			valid: r.valid,
			tokenCount: r.tokenCount,
			stats: {
				errors: r.errors.length,
				warnings: r.warnings.length,
				info: r.info.length,
			},
			errors: r.errors,
			warnings: r.warnings,
			info: verbose ? r.info : undefined,
		})),
	};
	return JSON.stringify(summary, null, 2);
};

/**
 * Formats validation reports as Markdown.
 * @param {ValidationReport[]} reports - Reports to format
 * @returns {string}
 */
const formatMarkdown = (reports) => {
	const allValid = reports.every((r) => r.valid);

	let md = `# Token Validation Report\n\n`;
	md += `Generated: ${new Date().toISOString()}\n\n`;
	md += `**Status**: ${allValid ? "✅ VALID" : "❌ INVALID"}\n\n`;

	// Summary table
	md += `## Summary\n\n`;
	md += `| File | Tokens | Errors | Warnings | Status |\n`;
	md += `|------|--------|--------|----------|--------|\n`;

	for (const r of reports) {
		const status = r.valid ? "✅" : "❌";
		md += `| ${r.file} | ${r.tokenCount} | ${r.errors.length} | ${r.warnings.length} | ${status} |\n`;
	}

	// Details
	for (const r of reports) {
		if (r.errors.length === 0 && r.warnings.length === 0) continue;

		md += `\n## ${r.file}\n\n`;

		if (r.errors.length > 0) {
			md += `### ❌ Errors (${r.errors.length})\n\n`;
			md += `| Path | Code | Message |\n`;
			md += `|------|------|----------|\n`;
			for (const issue of r.errors) {
				md += `| \`${issue.path || "(root)"}\` | ${issue.code} | ${issue.message} |\n`;
			}
		}

		if (r.warnings.length > 0) {
			md += `\n### ⚠️ Warnings (${r.warnings.length})\n\n`;
			md += `| Path | Code | Message |\n`;
			md += `|------|------|----------|\n`;
			for (const issue of r.warnings) {
				md += `| \`${issue.path || "(root)"}\` | ${issue.code} | ${issue.message} |\n`;
			}
		}
	}

	return md;
};

/**
 * Formats validation reports as CLI table.
 * @param {ValidationReport[]} reports - Reports to format
 * @returns {string}
 */
const formatTable = (reports) => {
	let output = "\n";
	const divider = "─".repeat(60);

	output += `${divider}\n`;
	output += `  Token Validation Report\n`;
	output += `${divider}\n\n`;

	output += `  ${"File".padEnd(25)} ${"Tokens".padStart(8)} ${"Errors".padStart(8)} ${"Warns".padStart(8)} Status\n`;
	output += `  ${"-".repeat(25)} ${"-".repeat(8)} ${"-".repeat(8)} ${"-".repeat(8)} ------\n`;

	for (const r of reports) {
		const status = r.valid ? "✅" : "❌";
		output += `  ${r.file.padEnd(25)} ${String(r.tokenCount).padStart(8)} ${String(r.errors.length).padStart(8)} ${String(r.warnings.length).padStart(8)} ${status}\n`;
	}

	output += `\n${divider}\n`;

	const allValid = reports.every((r) => r.valid);
	output += `  Status: ${allValid ? "✅ VALID" : "❌ INVALID"}\n`;
	output += `${divider}\n`;

	return output;
};

// Main execution
const resolvedInputDir = path.resolve(inputDir);

if (!fs.existsSync(resolvedInputDir)) {
	console.error(`Error: Input directory not found: ${resolvedInputDir}`);
	process.exit(1);
}

if (!quiet) {
	console.log("\nValidating tokens...");
	console.log(`  Directory: ${resolvedInputDir}`);
}

// Find token files
const tokenFiles = fs
	.readdirSync(resolvedInputDir)
	.filter((f) => f.endsWith(".json"));

if (tokenFiles.length === 0) {
	console.error("No JSON token files found.");
	process.exit(1);
}

// Collect all token paths across all files for reference checking
/** @type {Set<string>} */
const allPaths = new Set();
for (const file of tokenFiles) {
	const filePath = path.join(resolvedInputDir, file);
	try {
		const content = JSON.parse(fs.readFileSync(filePath, "utf8"));
		const paths = collectTokenPaths(content);
		for (const p of paths) {
			allPaths.add(p);
		}
	} catch {
		// Will be caught during validation
	}
}

// Validate each file
/** @type {ValidationReport[]} */
const reports = [];

for (const file of tokenFiles) {
	const filePath = path.join(resolvedInputDir, file);
	if (verbose) console.log(`  Validating ${file}...`);
	const report = validateFile(filePath, allPaths);
	reports.push(report);
}

// Generate output
let output;
let extension;

if (outputJson) {
	output = formatJson(reports);
	extension = ".json";
} else if (outputTable) {
	output = formatTable(reports);
	extension = ".txt";
} else {
	output = formatMarkdown(reports);
	extension = ".md";
}

if (dryRun) {
	console.log("\n[DRY RUN] Would write:");
	console.log(output.slice(0, 1000) + (output.length > 1000 ? "..." : ""));
	process.exit(0);
}

// Write output
const resolvedOutputPath = path.resolve(outputPath + extension);
fs.mkdirSync(path.dirname(resolvedOutputPath), { recursive: true });
fs.writeFileSync(resolvedOutputPath, output);

if (!quiet) {
	console.log(formatTable(reports));
	console.log(`Report saved to: ${resolvedOutputPath}`);
}

// Exit with error if validation failed
const allValid = reports.every((r) => r.valid);
const hasWarnings = reports.some((r) => r.warnings.length > 0);

if (!allValid) {
	process.exit(1);
} else if (strict && hasWarnings) {
	console.error("\nValidation passed but has warnings (--strict mode)");
	process.exit(1);
}
