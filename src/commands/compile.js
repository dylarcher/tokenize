#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

import * as sass from "sass";

import {
	defaultComponentPatterns,
	discoverComponents,
	flattenCssCustomProperties,
	getExcludePatterns,
	getUniqueComponentName,
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
		: config.compileOutDir || "./dist/";
const excludePatterns = getExcludePatterns(process.argv, config);
const componentPatterns = config.componentPatterns || defaultComponentPatterns;
const verbose = hasFlag(process.argv, ["-V", "--verbose"]);
const quiet = hasFlag(process.argv, ["-Q", "--quiet"]);
const dryRun = hasFlag(process.argv, ["-N", "--dry-run"]);

// New flags for separate compilation modes
const globalOnly = hasFlag(process.argv, ["--global"]);
const componentsOnly = hasFlag(process.argv, ["--components"]);
const compileAll = !globalOnly && !componentsOnly; // Default: compile everything

/**
 * Collects files from globalPaths config or falls back to scanning.
 * @returns {string[]} Array of global style file paths
 */
function collectGlobalFiles() {
	if (config.globalPaths && config.globalPaths.length > 0) {
		/** @type {string[]} */
		const files = [];
		for (const globalPath of config.globalPaths) {
			const resolved = path.resolve(globalPath);
			if (!fs.existsSync(resolved)) {
				if (!quiet)
					console.warn(`Warning: Global path does not exist: ${globalPath}`);
				continue;
			}
			const pathFiles = walkDirectory(resolved, {
				extensions: [".scss", ".sass", ".css"],
				ignore: config.ignore || [
					"node_modules",
					"dist",
					"build",
					".git",
					"compiled",
				],
				excludePatterns,
				includePartials: true,
			}).filter((f) => !isPartialFile(f));
			files.push(...pathFiles);
		}
		return files;
	}
	// Fallback: scan dir and filter out component files
	const allFiles = walkDirectory(dir, {
		extensions: [".scss"],
		ignore: config.ignore || [
			"node_modules",
			"dist",
			"build",
			".git",
			"compiled",
		],
		excludePatterns,
		includePartials: true,
	});
	return allFiles.filter(
		(f) => !isPartialFile(f) && !isComponentFile(f, componentPatterns),
	);
}

/**
 * Collects component files using the component detector.
 * @returns {Map<string, import('../helperUtils/components.js').ComponentDefinition>} Component definitions
 */
function collectComponentFiles() {
	if (config.componentPaths && config.componentPaths.length > 0) {
		return discoverComponents({
			componentPaths: config.componentPaths,
			manifest: config.manifest,
			ignore: config.ignore,
			exclude: config.exclude,
		});
	}
	// Fallback: scan dir and identify component files
	const allFiles = walkDirectory(dir, {
		extensions: [".scss"],
		ignore: config.ignore || [
			"node_modules",
			"dist",
			"build",
			".git",
			"compiled",
		],
		excludePatterns,
		includePartials: true,
	});
	const componentFilesList = allFiles.filter(
		(f) => !isPartialFile(f) && isComponentFile(f, componentPatterns),
	);

	/** @type {Map<string, import('../helperUtils/components.js').ComponentDefinition>} */
	const components = new Map();
	for (const file of componentFilesList) {
		const name = getUniqueComponentName(path.relative(dir, file));
		if (!components.has(name)) {
			components.set(name, {
				name,
				stylePaths: [],
				cssInJsPaths: [],
				fromManifest: false,
			});
		}
		const component = components.get(name);
		if (component) {
			component.stylePaths.push(file);
		}
	}
	return components;
}

if (!quiet) console.log(`Scanning for SCSS files...`);

const globalFiles = compileAll || globalOnly ? collectGlobalFiles() : [];
const componentDefs =
	compileAll || componentsOnly ? collectComponentFiles() : new Map();
const componentFiles = [...componentDefs.values()].flatMap((c) => c.stylePaths);

// Collect all files for building load paths
const allFiles = [...new Set([...globalFiles, ...componentFiles])];
const partials = walkDirectory(dir, {
	extensions: [".scss"],
	ignore: config.ignore || [
		"node_modules",
		"dist",
		"build",
		".git",
		"compiled",
	],
	excludePatterns,
	includePartials: true,
}).filter((f) => isPartialFile(f));

if (!quiet) {
	console.log(`Found ${allFiles.length + partials.length} SCSS files:`);
	if (compileAll || globalOnly)
		console.log(`  ${globalFiles.length} global entry files`);
	if (compileAll || componentsOnly)
		console.log(
			`  ${componentDefs.size} components (${componentFiles.length} files)`,
		);
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
 * Processes :global() selectors in CSS, converting them to static selectors.
 * @param {string} css - CSS string to process
 * @returns {string} CSS with :global() wrappers removed
 */
function processGlobalSelectors(css) {
	/* Match :global(.class-name) or :global(selector) and unwrap them
	   Handles nested cases like :global(.foo .bar) and :global(.foo):global(.bar) */
	return css.replace(/:global\(([^)]+)\)/g, "$1");
}

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
		return {
			success: false,
			error: e instanceof Error ? e.message : String(e),
		};
	}
}

if (dryRun) {
	console.log("\n[DRY RUN] Would create:");
	if (compileAll || globalOnly) console.log(`  ${outDir}/global.css`);
	if (compileAll || componentsOnly)
		console.log(
			`  ${outDir}/components/{ComponentName}/{ComponentName}.module.css (${componentDefs.size} components)`,
		);
	console.log(`  ${outDir}/manifest.json`);
	process.exit(0);
}

fs.mkdirSync(outDir, { recursive: true });
if (compileAll || componentsOnly) {
	fs.mkdirSync(path.join(outDir, "components"), { recursive: true });
}

/** @type {string[]} */
const globalCSS = [];
/** @type {Array<{file: string, error: string}>} */
const globalErrors = [];

if (compileAll || globalOnly) {
	if (!quiet) console.log("\nCompiling global styles...");

	for (const file of globalFiles) {
		const rel = path.relative(dir, file);
		if (verbose) process.stdout.write(`  ${rel}... `);

		const result = compileSCSS(file);

		if (result.success) {
			const flat = flattenCssCustomProperties(result.css || "");
			const processed = processGlobalSelectors(flat);
			if (processed.trim()) {
				globalCSS.push(`/* Source: ${rel} */\n${processed}`);
				if (verbose) console.log("OK");
			} else {
				if (verbose) console.log("OK (empty)");
			}
		} else {
			if (verbose) console.log("FAIL");
			globalErrors.push({ file: rel, error: result.error });
		}
	}
}

const globalOutput = globalCSS.join("\n\n");
if (compileAll || globalOnly) {
	fs.writeFileSync(path.join(outDir, "global.css"), globalOutput);
	if (!quiet)
		console.log(
			`\nWrote global.css (${(globalOutput.length / 1024).toFixed(1)}KB)`,
		);
}

/** @type {Array<{name: string, file: string, size: number}>} */
const componentResults = [];
/** @type {Array<{file: string, name: string, error: string}>} */
const componentErrors = [];

if (compileAll || componentsOnly) {
	if (!quiet) console.log("\nCompiling component styles...");

	// Create components directory structure: components/{ComponentName}/{ComponentName}.module.css
	for (const [componentName, componentDef] of componentDefs) {
		const componentDir = path.join(outDir, "components", componentName);
		fs.mkdirSync(componentDir, { recursive: true });

		/** @type {string[]} */
		const componentCSS = [];

		for (const file of componentDef.stylePaths) {
			const rel = path.relative(dir, file);
			if (verbose) process.stdout.write(`  ${rel} -> ${componentName}... `);

			const result = compileSCSS(file);

			if (result.success) {
				const flat = flattenCssCustomProperties(result.css || "");
				const processed = processGlobalSelectors(flat);
				if (processed.trim()) {
					componentCSS.push(`/* Source: ${rel} */\n${processed}`);
					if (verbose) console.log("OK");
				} else {
					if (verbose) console.log("OK (empty)");
				}
			} else {
				if (verbose) console.log("FAIL");
				componentErrors.push({
					file: rel,
					name: componentName,
					error: result.error,
				});
			}
		}

		if (componentCSS.length > 0) {
			const combinedCSS = componentCSS.join("\n\n");
			const outPath = path.join(componentDir, `${componentName}.module.css`);
			fs.writeFileSync(outPath, combinedCSS);
			componentResults.push({
				name: componentName,
				file: `components/${componentName}/${componentName}.module.css`,
				size: combinedCSS.length,
			});
		}
	}
}

const manifest = {
	compiled: new Date().toISOString(),
	source: dir,
	mode: globalOnly ? "global" : componentsOnly ? "components" : "all",
	global:
		compileAll || globalOnly
			? {
					sources: globalFiles.map((f) => path.relative(dir, f)),
					output: "global.css",
					size: globalOutput.length,
				}
			: null,
	components: componentResults,
	errors: [...globalErrors, ...componentErrors],
};

fs.writeFileSync(
	path.join(outDir, "manifest.json"),
	JSON.stringify(manifest, null, 2),
);

if (!quiet) {
	console.log(`\n${"=".repeat(50)}`);
	console.log("Compilation complete!");
	if (compileAll || globalOnly) {
		console.log(
			`  Global: ${globalFiles.length - globalErrors.length}/${globalFiles.length} files -> global.css`,
		);
	}
	if (compileAll || componentsOnly) {
		console.log(
			`  Components: ${componentResults.length}/${componentDefs.size} components`,
		);
	}

	if (globalErrors.length || componentErrors.length) {
		console.log(
			`\n! ${globalErrors.length + componentErrors.length} files failed:`,
		);
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
