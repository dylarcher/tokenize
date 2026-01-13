#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

import * as sass from "sass";

import {
	defaultComponentPatterns,
	flattenCssCustomProperties,
	getComponentName,
	getExcludePatterns,
	hasFlag,
	isComponentFile,
	isPartialFile,
	loadConfiguration,
	walkDirectory,
} from "../index.js";

/**
 * @typedef {import('../helperUtils/config.js').Config} Config
 */

/** @type {Config} */
const config = await loadConfiguration();
const dirArg = process.argv.slice(2).find((arg) => !arg.startsWith("-"));
const dir = path.resolve(dirArg || config.scanDir || ".");
const outputFlagIndex = process.argv.findIndex(
	(arg) => arg === "-o" || arg === "-O" || arg === "--out" || arg === "--dist",
);
const outDir =
	outputFlagIndex > -1
		? process.argv[outputFlagIndex + 1]
		: config.compileOutDir || "./tests/mocks/dist";
const excludePatterns = getExcludePatterns(process.argv, config);
const componentPatterns = config.componentPatterns || defaultComponentPatterns;
const verbose = hasFlag(process.argv, ["-V", "--verbose"]);
const quiet = hasFlag(process.argv, ["-Q", "--quiet"]);
const dryRun = hasFlag(process.argv, ["-N", "--dry-run"]);

if (!quiet) console.log(`Scanning ${dir} for SCSS files...`);

const allFiles = walkDirectory(dir, {
	extensions: [".scss"],
	ignore: config.ignore || ["node_modules", "dist", "build", ".git", "compiled"],
	excludePatterns,
	includePartials: true,
});

if (!quiet && excludePatterns.length) {
	console.log(`Excluding: ${excludePatterns.join(", ")}`);
}

const entryFiles = allFiles.filter((f) => !isPartialFile(f));
const partials = allFiles.filter((f) => isPartialFile(f));
const globalFiles = entryFiles.filter((f) => !isComponentFile(f, componentPatterns));
const componentFiles = entryFiles.filter((f) => isComponentFile(f, componentPatterns));

if (!quiet) {
	console.log(`Found ${allFiles.length} SCSS files:`);
	console.log(`  ${globalFiles.length} global entry files`);
	console.log(`  ${componentFiles.length} component files`);
	console.log(`  ${partials.length} partials`);
}

/**
 * Builds load paths for SCSS compilation.
 * @param {string} baseDir - Base directory
 * @param {string[]} files - Array of file paths
 * @returns {string[]} Array of load paths
 */
function buildLoadPaths(baseDir, files) {
	const dirs = new Set([baseDir]);

	for (const f of files) {
		dirs.add(path.dirname(f));
	}

	for (const p of ["src", "styles", "scss", "assets/styles", "lib"]) {
		const full = path.join(baseDir, p);
		if (fs.existsSync(full)) dirs.add(full);
	}

	return [...dirs];
}

const loadPaths = buildLoadPaths(dir, allFiles);

/**
 * Compiles an SCSS file to CSS.
 * @param {string} filepath - Path to the SCSS file
 * @returns {{ success: true, css: string } | { success: false, error: string }}
 */
function compileSCSS(filepath) {
	try {
		const result = sass.compile(filepath, {
			style: "expanded",
			sourceMap: false,
			loadPaths,
		});
		return { success: true, css: result.css };
	} catch (e) {
		return { success: false, error: e instanceof Error ? e.message : String(e) };
	}
}

if (dryRun) {
	console.log("\n[DRY RUN] Would create:");
	console.log(`  ${outDir}/global.css`);
	console.log(`  ${outDir}/components/*.css (${componentFiles.length} files)`);
	console.log(`  ${outDir}/manifest.json`);
	process.exit(0);
}

fs.mkdirSync(outDir, { recursive: true });
fs.mkdirSync(path.join(outDir, "components"), { recursive: true });

if (!quiet) console.log("\nCompiling global styles...");
const globalCSS = [];
const globalErrors = [];

for (const file of globalFiles) {
	const rel = path.relative(dir, file);
	if (verbose) process.stdout.write(`  ${rel}... `);

	const result = compileSCSS(file);

	if (result.success) {
		const flat = flattenCssCustomProperties(result.css || "");
		if (flat.trim()) {
			globalCSS.push(`/* Source: ${rel} */\n${flat}`);
			if (verbose) console.log("OK");
		} else {
			if (verbose) console.log("OK (empty)");
		}
	} else {
		if (verbose) console.log("FAIL");
		globalErrors.push({ file: rel, error: result.error });
	}
}

const globalOutput = globalCSS.join("\n\n");
fs.writeFileSync(path.join(outDir, "global.css"), globalOutput);
if (!quiet) console.log(`\nWrote global.css (${(globalOutput.length / 1024).toFixed(1)}KB)`);

if (!quiet) console.log("\nCompiling component styles...");
const componentResults = [];
const componentErrors = [];

for (const file of componentFiles) {
	const rel = path.relative(dir, file);
	const name = getComponentName(file);
	if (verbose) process.stdout.write(`  ${rel} -> ${name}.css... `);

	const result = compileSCSS(file);

	if (result.success) {
		const flat = flattenCssCustomProperties(result.css || "");
		if (flat.trim()) {
			const outPath = path.join(outDir, "components", `${name}.css`);
			fs.writeFileSync(outPath, `/* Source: ${rel} */\n${flat}`);
			componentResults.push({ name, file: rel, size: flat.length });
			if (verbose) console.log("OK");
		} else {
			if (verbose) console.log("OK (empty)");
		}
	} else {
		if (verbose) console.log("FAIL");
		componentErrors.push({ file: rel, name, error: result.error });
	}
}

const manifest = {
	compiled: new Date().toISOString(),
	source: dir,
	global: {
		sources: globalFiles.map((f) => path.relative(dir, f)),
		output: "global.css",
		size: globalOutput.length,
	},
	components: componentResults,
	errors: [...globalErrors, ...componentErrors],
};

fs.writeFileSync(path.join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));

if (!quiet) {
	console.log(`\n${"=".repeat(50)}`);
	console.log("Compilation complete!");
	console.log(
		`  Global: ${globalFiles.length - globalErrors.length}/${globalFiles.length} files -> global.css`,
	);
	console.log(`  Components: ${componentResults.length}/${componentFiles.length} files`);

	if (globalErrors.length || componentErrors.length) {
		console.log(`\n! ${globalErrors.length + componentErrors.length} files failed:`);
		const allErrors = [...globalErrors, ...componentErrors];
		for (const e of allErrors.slice(0, 5)) {
			console.log(`  ${e.file}: ${e.error.split("\n")[0]}`);
		}
		if (allErrors.length > 5) {
			console.log(`  ... and ${allErrors.length - 5} more (see manifest.json)`);
		}
	}

	console.log(`\nOutput: ${outDir}/`);
}
