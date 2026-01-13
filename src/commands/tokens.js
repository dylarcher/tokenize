#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { getOutputDirectory, hasFlag, loadConfiguration } from "../index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const config = await loadConfiguration();
const outDir = getOutputDirectory(process.argv, config, "./dist/");
const verbose = hasFlag(process.argv, ["-V", "--verbose"]);
const quiet = hasFlag(process.argv, ["-Q", "--quiet"]);
const dryRun = hasFlag(process.argv, ["-N", "--dry-run"]);

if (!fs.existsSync(outDir)) {
	fs.mkdirSync(outDir, { recursive: true });
}

/**
 * @typedef {'primitives' | 'semantic' | 'components'} Layer
 */

/** @type {Layer[]} */
const LAYERS = ["primitives", "semantic", "components"];

/** @type {Record<Layer, string>} */
const layerScripts = {
	primitives: path.join(__dirname, "..", "generators", "primitives.js"),
	semantic: path.join(__dirname, "..", "generators", "semantic.js"),
	components: path.join(__dirname, "..", "generators", "components.js"),
};

/** @type {Record<Layer, Layer[]>} */
const layerDependencies = {
	primitives: [],
	semantic: ["primitives"],
	components: ["semantic"],
};

/** @type {Record<Layer, string>} */
const layerOutputFiles = {
	primitives: "primitives.json",
	semantic: "semantic.json",
	components: "components.json",
};

/**
 * @typedef {Object} ParsedArgs
 * @property {Layer[]} layers
 * @property {boolean} force
 * @property {boolean} help
 * @property {boolean} all
 */

/**
 * Parses command line arguments.
 * @param {string[]} argv - Command line arguments
 * @returns {ParsedArgs}
 */
const parseArgs = (argv) => {
	/** @type {ParsedArgs} */
	const args = {
		layers: [],
		force: false,
		help: false,
		all: false,
	};

	for (let i = 2; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === "-h" || arg === "--help") {
			args.help = true;
		} else if (arg === "-f" || arg === "-W" || arg === "--force") {
			args.force = true;
		} else if (arg === "-a" || arg === "--all") {
			args.all = true;
		} else if (arg === "-l" || arg === "--layer") {
			const layer = argv[++i];
			if (layer && LAYERS.includes(/** @type {Layer} */ (layer))) {
				args.layers.push(/** @type {Layer} */ (layer));
			}
		} else if (LAYERS.includes(/** @type {Layer} */ (arg))) {
			args.layers.push(/** @type {Layer} */ (arg));
		}
	}

	return args;
};

const printHelp = () => {
	console.log(`
Usage: tokenize tokens [options] [layers...]

Generate design token layers in the correct dependency order.

Layers (in dependency order):
  primitives    Raw design values (colors, spacing, typography)
  semantic      Meaningful tokens referencing primitives
  components    Component-specific tokens referencing semantic

Options:
  -a, --all       Generate all layers in order
  -l, --layer     Specify a layer to generate (can be repeated)
  -f, --force     Regenerate even if output exists
  -o, --out       Output directory (default: ./tokens)
  -c, --config    Config file path (default: tokenize.config.js)
  -V, --verbose   Verbose output
  -Q, --quiet     Suppress output
  -N, --dry-run   Preview without writing files
  -h, --help      Show this help message

Examples:
  tokenize tokens --all              Generate all layers
  tokenize tokens primitives         Generate primitives only
  tokenize tokens semantic           Generate semantic (and primitives if needed)
  tokenize tokens -l semantic -l components
                                     Generate semantic and components
  tokenize tokens --all --force      Regenerate all layers
`);
};

/**
 * Checks if layer dependencies are satisfied.
 * @param {Layer} layer - The layer to check
 * @returns {Layer[]} Array of missing dependencies
 */
const checkDependencies = (layer) => {
	const deps = layerDependencies[layer];
	/** @type {Layer[]} */
	const missing = [];

	for (const dep of deps) {
		const outputFile = path.join(outDir, layerOutputFiles[dep]);
		if (!fs.existsSync(outputFile)) {
			missing.push(dep);
		}
	}

	return missing;
};

/**
 * Runs a layer generation script.
 * @param {Layer} layer - The layer to generate
 * @returns {Promise<void>}
 */
const runLayer = async (layer) => {
	const scriptPath = layerScripts[layer];

	if (!fs.existsSync(scriptPath)) {
		throw new Error(`Script not found: ${scriptPath}`);
	}

	if (!quiet) console.log(`\n> Generating ${layer} tokens...`);

	const { spawn } = await import("node:child_process");

	return /** @type {Promise<void>} */ (
		new Promise((resolve, reject) => {
			/** @type {string[]} */
			const args = [scriptPath];

			const outIdx = process.argv.findIndex((a) => a === "-o" || a === "--out");
			if (outIdx > -1 && process.argv[outIdx + 1]) {
				args.push("-o", process.argv[outIdx + 1]);
			}

			const configIdx = process.argv.findIndex((a) => a === "-c" || a === "--config");
			if (configIdx > -1 && process.argv[configIdx + 1]) {
				args.push("-c", process.argv[configIdx + 1]);
			}

			if (quiet) args.push("-Q");
			if (verbose) args.push("-V");

			// Use bun if available, otherwise fall back to node
			const runtime = process.versions.bun ? "bun" : "node";
			const child = spawn(runtime, args, {
				stdio: "inherit",
				cwd: process.cwd(),
			});

			child.on("close", (code) => {
				if (code === 0) {
					resolve(undefined);
				} else {
					reject(new Error(`${layer} generation failed with code ${code}`));
				}
			});

			child.on("error", reject);
		})
	);
};

/**
 * Generates token layers in dependency order.
 * @param {Layer[]} layers - Layers to generate
 * @param {boolean} [force=false] - Force regeneration
 * @returns {Promise<void>}
 */
const generateLayers = async (layers, force = false) => {
	/** @type {Set<Layer>} */
	const generated = new Set();
	/** @type {Layer[]} */
	const toGenerate = [];

	/**
	 * Adds a layer and its dependencies to the generation list.
	 * @param {Layer} layer - Layer to add
	 */
	const addWithDependencies = (layer) => {
		if (toGenerate.includes(layer)) return;

		const deps = layerDependencies[layer];
		for (const dep of deps) {
			addWithDependencies(dep);
		}
		toGenerate.push(layer);
	};

	for (const layer of layers) {
		addWithDependencies(layer);
	}

	const layersToRun = force
		? toGenerate
		: toGenerate.filter((layer) => {
				const outputFile = path.join(outDir, layerOutputFiles[layer]);
				if (!fs.existsSync(outputFile)) return true;
				if (layers.includes(layer)) return true;
				return false;
			});

	if (layersToRun.length === 0) {
		if (!quiet) console.log("All requested layers already exist. Use --force to regenerate.");
		return;
	}

	if (dryRun) {
		console.log("\n[DRY RUN] Would generate:");
		for (const layer of layersToRun) {
			console.log(`  ${outDir}/${layerOutputFiles[layer]}`);
		}
		return;
	}

	if (!quiet) console.log(`Token layers to generate: ${layersToRun.join(" -> ")}`);

	for (const layer of layersToRun) {
		const missing = checkDependencies(layer);
		if (missing.length > 0 && !generated.has(missing[0])) {
			throw new Error(
				`Missing dependencies for ${layer}: ${missing.join(", ")}\n` +
					`Run with --all or generate dependencies first.`,
			);
		}

		await runLayer(layer);
		generated.add(layer);
	}

	if (!quiet) {
		console.log("\n+ Token generation complete!");
		console.log(`  Output directory: ${outDir}`);
	}
};

const main = async () => {
	const args = parseArgs(process.argv);

	if (args.help) {
		printHelp();
		process.exit(0);
	}

	/** @type {Layer[]} */
	let layersToGenerate = args.layers;

	if (args.all) {
		layersToGenerate = LAYERS;
	} else if (layersToGenerate.length === 0) {
		if (!quiet) console.log("No layers specified. Use --all to generate all layers.");
		printHelp();
		process.exit(1);
	}

	try {
		await generateLayers(layersToGenerate, args.force);
	} catch (error) {
		console.error(
			`\n! Error: ${error instanceof Error ? error.message : String(error)}`,
		);
		process.exit(1);
	}
};

main();
