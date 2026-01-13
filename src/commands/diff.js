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

// Output format flags
const outputJson = hasFlag(process.argv, ["--json"]);
const outputTable = hasFlag(process.argv, ["--table"]);
const _outputMd =
	hasFlag(process.argv, ["--md"]) || (!outputJson && !outputTable);

// Input/output paths
const generatedDir = getFlagValue(
	process.argv,
	["-g", "--generated"],
	config.outDir || "./dist/.tmp",
);
const refsDir = getFlagValue(process.argv, ["-r", "--refs"], config.refsDir);
const outputPath = getFlagValue(
	process.argv,
	["-o", "--output"],
	"./dist/.tmp/audits/gapAnalysis",
);

const usage = `
Usage: tokenize diff [options]

Compare generated token files against reference files to identify differences.

Options:
  -g, --generated <dir>  Directory containing generated token files (default: ./dist/.tmp)
  -r, --refs <dir>       Directory containing reference token files
  -o, --output <path>    Output path for diff report (without extension)

Output Formats:
  --json                 Output as JSON (for CI integration)
  --md                   Output as Markdown (default, for PR reports)
  --table                Output as CLI table

  -V, --verbose          Verbose output
  -Q, --quiet            Suppress output
  -N, --dry-run          Preview without writing files
  -h, --help             Show this help message

Examples:
  tokenize diff -g ./dist/.tmp -r ./tokens/_refs
  tokenize diff --json -o ./reports/diff
  tokenize diff --md --verbose
`;

if (hasFlag(process.argv, ["-h", "--help"])) {
	console.log(usage);
	process.exit(0);
}

/**
 * @typedef {Object} TokenDiff
 * @property {string} path - Token path
 * @property {'missing' | 'extra' | 'mismatch' | 'type-mismatch'} type - Diff type
 * @property {unknown} [expected] - Expected value (from refs)
 * @property {unknown} [actual] - Actual value (from generated)
 */

/**
 * @typedef {Object} DiffReport
 * @property {string} layer - Token layer name
 * @property {TokenDiff[]} missing - Tokens in refs but not in generated
 * @property {TokenDiff[]} extra - Tokens in generated but not in refs
 * @property {TokenDiff[]} mismatched - Tokens with different values
 * @property {number} total - Total tokens compared
 * @property {number} matched - Number of matching tokens
 */

/**
 * Flattens a nested token object into dot-notation paths.
 * @param {unknown} obj - Object to flatten
 * @param {string} [prefix=''] - Current path prefix
 * @returns {Map<string, unknown>} Map of path -> value
 */
const flattenTokens = (obj, prefix = "") => {
	/** @type {Map<string, unknown>} */
	const result = new Map();

	if (typeof obj !== "object" || obj === null) {
		return result;
	}

	const o = /** @type {Record<string, unknown>} */ (obj);

	// Check if this is a token leaf node
	if ("$value" in o || "value" in o) {
		const value = o.$value ?? o.value;
		const type = o.$type ?? o.type;
		result.set(prefix, { value, type });
		return result;
	}

	for (const [key, value] of Object.entries(o)) {
		// Skip metadata keys
		if (key.startsWith("$")) continue;

		const newPrefix = prefix ? `${prefix}.${key}` : key;

		if (typeof value === "object" && value !== null) {
			const nested = flattenTokens(value, newPrefix);
			for (const [k, v] of nested) {
				result.set(k, v);
			}
		} else {
			result.set(newPrefix, { value, type: "unknown" });
		}
	}

	return result;
};

/**
 * Compares two token maps and generates a diff report.
 * @param {Map<string, unknown>} generated - Generated tokens
 * @param {Map<string, unknown>} refs - Reference tokens
 * @param {string} layer - Layer name
 * @returns {DiffReport}
 */
const compareTokenMaps = (generated, refs, layer) => {
	/** @type {TokenDiff[]} */
	const missing = [];
	/** @type {TokenDiff[]} */
	const extra = [];
	/** @type {TokenDiff[]} */
	const mismatched = [];
	let matched = 0;

	// Find missing and mismatched tokens
	for (const [path, refToken] of refs) {
		const genToken = generated.get(path);

		if (!genToken) {
			missing.push({
				path,
				type: "missing",
				expected: refToken,
			});
		} else {
			const refValue = /** @type {{value: unknown, type: string}} */ (refToken);
			const genValue = /** @type {{value: unknown, type: string}} */ (genToken);

			if (JSON.stringify(refValue.value) !== JSON.stringify(genValue.value)) {
				mismatched.push({
					path,
					type: refValue.type !== genValue.type ? "type-mismatch" : "mismatch",
					expected: refToken,
					actual: genToken,
				});
			} else {
				matched++;
			}
		}
	}

	// Find extra tokens (in generated but not in refs)
	for (const [path, genToken] of generated) {
		if (!refs.has(path)) {
			extra.push({
				path,
				type: "extra",
				actual: genToken,
			});
		}
	}

	return {
		layer,
		missing,
		extra,
		mismatched,
		total: refs.size,
		matched,
	};
};

/**
 * Formats a diff report as JSON.
 * @param {DiffReport[]} reports - Array of diff reports
 * @returns {string}
 */
const formatJson = (reports) => {
	const summary = {
		timestamp: new Date().toISOString(),
		reports: reports.map((r) => ({
			layer: r.layer,
			stats: {
				total: r.total,
				matched: r.matched,
				missing: r.missing.length,
				extra: r.extra.length,
				mismatched: r.mismatched.length,
			},
			missing: r.missing,
			extra: r.extra,
			mismatched: r.mismatched,
		})),
	};
	return JSON.stringify(summary, null, 2);
};

/**
 * Formats a diff report as Markdown.
 * @param {DiffReport[]} reports - Array of diff reports
 * @returns {string}
 */
const formatMarkdown = (reports) => {
	let md = `# Token Gap Analysis\n\n`;
	md += `Generated: ${new Date().toISOString()}\n\n`;

	// Summary table
	md += `## Summary\n\n`;
	md += `| Layer | Total | Matched | Missing | Extra | Mismatched |\n`;
	md += `|-------|-------|---------|---------|-------|------------|\n`;

	for (const r of reports) {
		const matchPct =
			r.total > 0 ? ((r.matched / r.total) * 100).toFixed(1) : "N/A";
		md += `| ${r.layer} | ${r.total} | ${r.matched} (${matchPct}%) | ${r.missing.length} | ${r.extra.length} | ${r.mismatched.length} |\n`;
	}

	// Details per layer
	for (const r of reports) {
		if (
			r.missing.length === 0 &&
			r.extra.length === 0 &&
			r.mismatched.length === 0
		) {
			continue;
		}

		md += `\n## ${r.layer}\n\n`;

		if (r.missing.length > 0) {
			md += `### Missing Tokens (${r.missing.length})\n\n`;
			md += `Tokens defined in reference but not found in generated output:\n\n`;
			md += `| Token Path | Expected Value | Type |\n`;
			md += `|------------|----------------|------|\n`;
			for (const diff of r.missing.slice(0, 50)) {
				const expected = /** @type {{value: unknown, type: string}} */ (
					diff.expected
				);
				md += `| \`${diff.path}\` | \`${JSON.stringify(expected.value)}\` | ${expected.type} |\n`;
			}
			if (r.missing.length > 50) {
				md += `\n*... and ${r.missing.length - 50} more*\n`;
			}
		}

		if (r.extra.length > 0) {
			md += `\n### Extra Tokens (${r.extra.length})\n\n`;
			md += `Tokens found in generated output but not in reference:\n\n`;
			md += `| Token Path | Value | Type |\n`;
			md += `|------------|-------|------|\n`;
			for (const diff of r.extra.slice(0, 50)) {
				const actual = /** @type {{value: unknown, type: string}} */ (
					diff.actual
				);
				md += `| \`${diff.path}\` | \`${JSON.stringify(actual.value)}\` | ${actual.type} |\n`;
			}
			if (r.extra.length > 50) {
				md += `\n*... and ${r.extra.length - 50} more*\n`;
			}
		}

		if (r.mismatched.length > 0) {
			md += `\n### Mismatched Tokens (${r.mismatched.length})\n\n`;
			md += `Tokens with different values between reference and generated:\n\n`;
			md += `| Token Path | Expected | Actual | Issue |\n`;
			md += `|------------|----------|--------|-------|\n`;
			for (const diff of r.mismatched.slice(0, 50)) {
				const expected = /** @type {{value: unknown, type: string}} */ (
					diff.expected
				);
				const actual = /** @type {{value: unknown, type: string}} */ (
					diff.actual
				);
				md += `| \`${diff.path}\` | \`${JSON.stringify(expected.value)}\` | \`${JSON.stringify(actual.value)}\` | ${diff.type} |\n`;
			}
			if (r.mismatched.length > 50) {
				md += `\n*... and ${r.mismatched.length - 50} more*\n`;
			}
		}
	}

	return md;
};

/**
 * Formats a diff report as CLI table.
 * @param {DiffReport[]} reports - Array of diff reports
 * @returns {string}
 */
const formatTable = (reports) => {
	let output = "\n";
	const divider = "─".repeat(70);

	output += `${divider}\n`;
	output += `  Token Gap Analysis\n`;
	output += `${divider}\n\n`;

	output += `  ${"Layer".padEnd(15)} ${"Total".padStart(8)} ${"Match".padStart(8)} ${"Missing".padStart(8)} ${"Extra".padStart(8)} ${"Mismatch".padStart(8)}\n`;
	output += `  ${"-".repeat(15)} ${"-".repeat(8)} ${"-".repeat(8)} ${"-".repeat(8)} ${"-".repeat(8)} ${"-".repeat(8)}\n`;

	let totalTokens = 0;
	let totalMatched = 0;
	let totalMissing = 0;
	let totalExtra = 0;
	let totalMismatched = 0;

	for (const r of reports) {
		const matchPct =
			r.total > 0 ? `${((r.matched / r.total) * 100).toFixed(0)}%` : "N/A";
		output += `  ${r.layer.padEnd(15)} ${String(r.total).padStart(8)} ${matchPct.padStart(8)} ${String(r.missing.length).padStart(8)} ${String(r.extra.length).padStart(8)} ${String(r.mismatched.length).padStart(8)}\n`;

		totalTokens += r.total;
		totalMatched += r.matched;
		totalMissing += r.missing.length;
		totalExtra += r.extra.length;
		totalMismatched += r.mismatched.length;
	}

	output += `  ${"-".repeat(15)} ${"-".repeat(8)} ${"-".repeat(8)} ${"-".repeat(8)} ${"-".repeat(8)} ${"-".repeat(8)}\n`;
	const totalPct =
		totalTokens > 0
			? `${((totalMatched / totalTokens) * 100).toFixed(0)}%`
			: "N/A";
	output += `  ${"TOTAL".padEnd(15)} ${String(totalTokens).padStart(8)} ${totalPct.padStart(8)} ${String(totalMissing).padStart(8)} ${String(totalExtra).padStart(8)} ${String(totalMismatched).padStart(8)}\n`;

	output += `\n${divider}\n`;

	return output;
};

// Main execution
if (!refsDir) {
	console.error(
		"Error: Reference directory is required. Use -r or --refs, or set refsDir in config.",
	);
	process.exit(1);
}

const resolvedRefsDir = path.resolve(refsDir);
const resolvedGeneratedDir = path.resolve(generatedDir);

if (!fs.existsSync(resolvedRefsDir)) {
	console.error(`Error: Reference directory not found: ${resolvedRefsDir}`);
	process.exit(1);
}

if (!fs.existsSync(resolvedGeneratedDir)) {
	console.error(
		`Error: Generated directory not found: ${resolvedGeneratedDir}`,
	);
	process.exit(1);
}

if (!quiet) {
	console.log("\nComparing tokens...");
	console.log(`  Generated: ${resolvedGeneratedDir}`);
	console.log(`  Reference: ${resolvedRefsDir}`);
}

// Token layer mapping
const layers = [
	{
		name: "primitive",
		refFile: "primitive.tokens.json",
		genFile: "primitives.json",
	},
	{
		name: "semantic",
		refFile: "semantics.tokens.json",
		genFile: "semantic.json",
	},
	{
		name: "component",
		refFile: "component.tokens.json",
		genFile: "components.json",
	},
];

/** @type {DiffReport[]} */
const reports = [];

for (const layer of layers) {
	const refPath = path.join(resolvedRefsDir, layer.refFile);
	const genPath = path.join(resolvedGeneratedDir, layer.genFile);

	if (!fs.existsSync(refPath)) {
		if (verbose)
			console.log(`  Skipping ${layer.name}: reference file not found`);
		continue;
	}

	if (!fs.existsSync(genPath)) {
		if (verbose)
			console.log(`  Skipping ${layer.name}: generated file not found`);
		continue;
	}

	try {
		const refTokens = JSON.parse(fs.readFileSync(refPath, "utf8"));
		const genTokens = JSON.parse(fs.readFileSync(genPath, "utf8"));

		const refMap = flattenTokens(refTokens);
		const genMap = flattenTokens(genTokens);

		if (verbose) {
			console.log(
				`  ${layer.name}: ${refMap.size} ref tokens, ${genMap.size} generated tokens`,
			);
		}

		const report = compareTokenMaps(genMap, refMap, layer.name);
		reports.push(report);
	} catch (error) {
		console.error(
			`  Error processing ${layer.name}: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
}

if (reports.length === 0) {
	console.error("No token files found to compare.");
	process.exit(1);
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
	// Always show table summary
	console.log(formatTable(reports));
	console.log(`\nReport saved to: ${resolvedOutputPath}`);
}
