#!/usr/bin/env node

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageJsonPath = path.join(__dirname, "..", "package.json");
const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));

/** @type {string[]} */
const [, , cmd, ...args] = process.argv;

/** @type {string} */
const commandsDir = path.join(__dirname, "commands");

/**
 * Map of command names to their corresponding script filenames.
 * @type {Record<string, string | null>}
 */
const commands = {
	// Core commands
	compile: "compile.js",
	build: "compile.js",
	scan: "scan.js",
	audit: "scan.js",
	tokens: "tokens.js",
	types: "types.js",
	docs: "docs.js",
	// Token management commands
	format: "format.js",
	diff: "diff.js",
	validate: "validate.js",
	// Pipeline commands
	all: null,
	bundle: null,
	// Utility commands
	init: null,
	debug: null,
	stats: null,
	watch: null,
};

/** @type {string} */
const usage = `
Tokenize CLI v${pkg.version} - Extract and generate design tokens from SCSS/CSS

Commands:
  build, compile [dir]       Compile SCSS/SASS to CSS
  scan, audit [dir]          Scan for style values and extract tokens
  tokens [layers...]         Generate token layers (primitives, semantic, components)
  types                      Bundle TypeScript declarations
  docs                       Generate documentation from JSDoc comments
  format                     Convert between DTCG and legacy token formats
  diff                       Compare generated tokens against reference files
  validate                   Validate tokens for DTCG compliance and issues
  bundle                     Run full pipeline (scan -> compile -> tokens -> diff -> validate)
  init                       Generate starter config file
  debug <token>              Trace token resolution chain
  stats                      Show token analytics
  watch                      Watch for changes and rebuild
  all [dir]                  Run full pipeline (scan -> tokens)

Token Layers:
  primitives                 Raw design values (colors, spacing, typography)
  semantic                   Meaningful tokens referencing primitives
  components                 Component-specific tokens referencing semantic

Options:
  -c, --config <path>        Config file path (default: tokenize.config.js)
  -o, --out <path>           Output directory
  -e, --exclude <pattern>    Glob patterns to exclude (repeatable)
  -a, --all                  Generate all token layers
  -l, --layer <name>         Specify layer to generate (repeatable)
  -f, --force                Force regeneration of files
  --global                   Compile global styles only (compile command)
  --components               Compile component styles only (compile command)
  --json                     Output as JSON (diff/validate)
  --md                       Output as Markdown (diff/validate, default)
  --table                    Output as CLI table (diff/validate)
  --strict                   Fail on warnings (validate)

  -V, --verbose              Verbose output
  -Q, --quiet                Suppress non-error output
  -N, --dry-run              Preview without writing files
  -H, --no-color             Disable colored output
  -v, --version              Show version number
  -h, --help                 Show this help message

Examples:
  tokenize build ./src -o ./compiled
  tokenize compile --global -o ./dist
  tokenize compile --components -o ./dist/components
  tokenize scan ./compiled -o ./tokens
  tokenize tokens --all
  tokenize tokens primitives semantic
  tokenize format --to-dtcg ./tokens
  tokenize diff ./dist ./refs --json
  tokenize validate --strict
  tokenize bundle ./src
  tokenize all ./src -e "**/legacy/**"
  tokenize debug button.primary.background
  tokenize stats --by category
`;

/**
 * Checks if a flag is present in arguments.
 * @param {string[]} argv - Arguments array
 * @param {string[]} flags - Flags to check
 * @returns {boolean}
 */
const hasFlag = (argv, flags) => argv.some((arg) => flags.includes(arg));

/**
 * Displays usage information and exits the process.
 * @param {number} [exitCode=0] - The exit code
 * @returns {never}
 */
const showUsage = (exitCode = 0) => {
	console.info(usage);
	process.exit(exitCode);
};

/**
 * Displays version and exits.
 * @returns {never}
 */
const showVersion = () => {
	console.info(`tokenize v${pkg.version}`);
	process.exit(0);
};

// Handle global flags first (before command validation)
if (cmd === "-v" || cmd === "--version" || cmd === "version") {
	showVersion();
}

if (cmd === "-h" || cmd === "--help" || cmd === "help" || !cmd) {
	showUsage(0);
}

if (!Object.hasOwn(commands, cmd)) {
	console.error(`Unknown command: ${cmd}\n`);
	showUsage(1);
}

/**
 * Constructs the full path to a command script.
 * @param {string} commandName - The name of the command
 * @returns {string} The full path to the script file
 */
const getScriptPath = (commandName) =>
	path.join(commandsDir, `${commands[commandName]}`);

/**
 * Runs a command script with the specified arguments.
 * @param {string} commandName - The name of the command to run
 * @param {string[]} [extraArguments=[]] - Additional arguments
 * @returns {Promise<void>}
 */
const runScriptWithOutput = async (commandName, extraArguments = []) => {
	const script = getScriptPath(commandName);
	const runtime = process.versions.bun ? "bun" : "node";

	return new Promise((resolve, reject) => {
		const child = spawn(runtime, [script, ...extraArguments], {
			stdio: "inherit",
			cwd: process.cwd(),
		});

		child.on("close", (code) => {
			if (code === 0) {
				resolve();
			} else {
				reject(new Error(`Command "${commandName}" exited with code ${code}`));
			}
		});

		child.on("error", (error) => {
			reject(error);
		});
	});
};

/**
 * Runs the full bundle pipeline (compile -> scan -> tokens -> diff -> validate).
 * @param {string} directory - The directory to process
 * @param {string[]} passArguments - Arguments to pass through
 * @returns {Promise<void>}
 */
const runBundlePipeline = async (directory, passArguments) => {
	const quiet = hasFlag(passArguments, ["-Q", "--quiet"]);
	try {
		if (!quiet) console.info("\n[1/5] Compiling global styles...");
		await runScriptWithOutput("compile", [
			"--global",
			directory,
			...passArguments,
		]);

		if (!quiet) console.info("\n[2/5] Compiling component styles...");
		await runScriptWithOutput("compile", [
			"--components",
			directory,
			...passArguments,
		]);

		if (!quiet) console.info("\n[3/5] Generating token layers...");
		await runScriptWithOutput("tokens", ["--all", ...passArguments]);

		if (!quiet) console.info("\n[4/5] Comparing tokens with references...");
		try {
			await runScriptWithOutput("diff", [...passArguments]);
		} catch {
			// diff may fail if refs don't exist yet
			if (!quiet) console.info("  (skipped - no reference files found)");
		}

		if (!quiet) console.info("\n[5/5] Validating tokens...");
		await runScriptWithOutput("validate", [...passArguments]);

		if (!quiet) console.info("\n✓ Bundle complete!");
	} catch (problem) {
		console.error(problem);
		process.exit(1);
	}
};

/**
 * Runs watch mode for development.
 * @param {string} directory - The directory to watch
 * @param {string[]} passArguments - Arguments to pass through
 * @returns {Promise<void>}
 */
const runWatch = async (directory, passArguments) => {
	// Dynamic import for fs.watch
	const quiet = hasFlag(passArguments, ["-Q", "--quiet"]);

	const { loadConfiguration } = await import("./index.js");
	const config = await loadConfiguration();

	const watchDirs = [
		...(config.globalPaths || [config.scanDir]),
		...(config.componentPaths || []),
	].map((dir) => path.resolve(process.cwd(), dir));

	if (!quiet) {
		console.info("\nWatching for changes...");
		console.info(`  Directories: ${watchDirs.join(", ")}`);
		console.info("  Press Ctrl+C to stop\n");
	}

	let debounceTimer = null;
	let isBuilding = false;

	/**
	 * Handles file change events.
	 * @param {string} _eventType - Event type
	 * @param {string} filename - Changed filename
	 */
	const handleChange = (_eventType, filename) => {
		if (!filename || isBuilding) return;
		if (!/\.(s?css|sass)$/i.test(filename)) return;

		if (debounceTimer) clearTimeout(debounceTimer);

		debounceTimer = setTimeout(async () => {
			isBuilding = true;
			console.info(`\nFile changed: ${filename}`);

			try {
				await runBundlePipeline(directory, [...passArguments, "-Q"]);
				console.info("✓ Rebuild complete\n");
			} catch (error) {
				console.error("✗ Rebuild failed:", error);
			} finally {
				isBuilding = false;
			}
		}, 300);
	};

	for (const watchDir of watchDirs) {
		if (fs.existsSync(watchDir)) {
			fs.watch(watchDir, { recursive: true }, handleChange);
		}
	}

	// Keep process alive
	process.stdin.resume();
};

/**
 * Runs the full token generation pipeline (scan -> tokens).
 * @param {string} directory - The directory to scan
 * @param {string[]} passArguments - Arguments to pass through
 * @returns {Promise<void>}
 */
const runFullPipeline = async (directory, passArguments) => {
	const quiet = hasFlag(passArguments, ["-Q", "--quiet"]);
	try {
		if (!quiet) console.info("\n-> Running scan...");
		await runScriptWithOutput("scan", [directory, ...passArguments]);

		if (!quiet) console.info("\n-> Generating token layers...");
		await runScriptWithOutput("tokens", ["--all", ...passArguments]);

		if (!quiet) console.info("\n+ Pipeline complete!");
	} catch (problem) {
		console.error(problem);
		process.exit(1);
	}
};

/**
 * Generates a starter config file.
 * @returns {Promise<void>}
 */
const runInit = async () => {
	const configPath = path.join(process.cwd(), "tokenize.config.js");

	if (fs.existsSync(configPath)) {
		console.error("tokenize.config.js already exists");
		process.exit(1);
	}

	const configContent = `// Tokenize configuration
// See: https://github.com/tokenize/tokenize#configuration

export default {
	// Directory to scan for styles
	scanDir: ".",

	// Output directory for generated tokens
	outDir: "./tokens",

	// Output directory for compiled CSS
	compileOutDir: "./compiled",

	// Directories to ignore when scanning
	ignore: ["node_modules", "dist", "build", ".git", "compiled"],

	// Glob patterns to exclude
	exclude: [],

	// Patterns to identify component files
	componentPatterns: [
		/\\.component\\.s?css$/i,
		/\\.module\\.s?css$/i,
		/components\\/[^/]+\\/[^/]+\\.s?css$/i,
	],

	// Base unit for spacing scale (in pixels)
	spacingBase: 4,

	// Output formats to generate
	outputFormats: ["json", "scss", "css"],
};
`;

	fs.writeFileSync(configPath, configContent);
	console.info("Created tokenize.config.js");
};

/**
 * Shows token statistics.
 * @param {string[]} passArgs - Arguments
 * @returns {Promise<void>}
 */
const runStats = async (passArgs) => {
	const { loadConfiguration, getOutputDirectory } = await import("./index.js");

	console.log({ passArgs });
	const config = await loadConfiguration();
	const outDir = getOutputDirectory(process.argv, config, "./dist/");

	const files = ["primitives.json", "semantic.json", "components.json"];

	/** @type {Record<string, unknown>} */
	const stats = {};

	for (const file of files) {
		const filePath = path.join(outDir, file);
		if (fs.existsSync(filePath)) {
			const content = JSON.parse(fs.readFileSync(filePath, "utf8"));
			const name = file.replace(".json", "");
			stats[name] = countTokens(content);
		}
	}

	console.info("\nToken Statistics:");
	console.info("=".repeat(40));

	let total = 0;
	for (const [layer, count] of Object.entries(stats)) {
		console.info(`  ${layer.padEnd(15)} ${String(count).padStart(5)} tokens`);
		total += /** @type {number} */ (count);
	}

	console.info("-".repeat(40));
	console.info(`  ${"Total".padEnd(15)} ${String(total).padStart(5)} tokens`);
	console.info("");
};

/**
 * Counts tokens in an object recursively.
 * @param {unknown} obj - Object to count
 * @returns {number}
 */
const countTokens = (obj) => {
	if (typeof obj !== "object" || obj === null) return 1;

	let count = 0;
	for (const value of Object.values(obj)) {
		if (typeof value === "object" && value !== null) {
			count += countTokens(value);
		} else {
			count += 1;
		}
	}
	return count;
};

/**
 * Traces a token's resolution chain.
 * @param {string} tokenName - Token to trace
 * @param {string[]} passArgs - Arguments
 * @returns {Promise<void>}
 */
const runDebug = async (tokenName, passArgs) => {
	if (!tokenName || tokenName.startsWith("-")) {
		console.error("Usage: tokenize debug <token-name>");
		console.error("Example: tokenize debug button.primary.background");
		process.exit(1);
	}

	console.log({ passArgs });
	const { loadConfiguration, getOutputDirectory } = await import("./index.js");

	const config = await loadConfiguration();
	const outDir = getOutputDirectory(process.argv, config, "./dist/");

	const layers = ["components", "semantic", "primitives"];

	/** @type {Record<string, unknown>} */
	const tokens = {};

	for (const layer of layers) {
		const filePath = path.join(outDir, `${layer}.json`);
		if (fs.existsSync(filePath)) {
			tokens[layer] = JSON.parse(fs.readFileSync(filePath, "utf8"));
		}
	}

	console.info(`\nTracing: ${tokenName}`);
	console.info("=".repeat(50));

	const chain = [];
	let currentToken = tokenName;
	let depth = 0;
	const maxDepth = 10;

	while (depth < maxDepth) {
		const result = findToken(currentToken, tokens);

		if (!result) {
			chain.push({ token: currentToken, value: "(not found)", layer: "?" });
			break;
		}

		chain.push({
			token: currentToken,
			value: result.value,
			layer: result.layer,
		});

		if (typeof result.value === "string" && result.value.startsWith("{")) {
			currentToken = result.value.slice(1, -1);
			depth++;
		} else {
			break;
		}
	}

	for (let i = 0; i < chain.length; i++) {
		const { token, value, layer } = chain[i];
		const indent = "  ".repeat(i);
		const arrow = i > 0 ? "-> " : "";
		const displayValue =
			typeof value === "object" ? JSON.stringify(value) : String(value);
		console.info(`${indent}${arrow}[${layer}] ${token}`);
		console.info(`${indent}   = ${displayValue}`);
	}

	console.info("");
};

/**
 * Finds a token by path in the token layers.
 * @param {string} tokenPath - Dot-separated token path
 * @param {Record<string, unknown>} tokens - Token layers
 * @returns {{ value: unknown, layer: string } | null}
 */
const findToken = (tokenPath, tokens) => {
	const parts = tokenPath.split(".");

	for (const [layer, layerTokens] of Object.entries(tokens)) {
		let current = layerTokens;

		for (const part of parts) {
			if (current && typeof current === "object" && part in current) {
				current = /** @type {Record<string, unknown>} */ (current)[part];
			} else {
				current = undefined;
				break;
			}
		}

		if (current !== undefined) {
			return { value: current, layer };
		}
	}

	return null;
};

/**
 * @typedef {Object} ParsedArguments
 * @property {string} directory - The target directory
 * @property {string[]} passArguments - Arguments to pass through
 */

/**
 * Parses command line arguments.
 * @param {string[]} argumentList - The command line arguments
 * @returns {ParsedArguments}
 */
const parseArguments = (argumentList) => {
	const directory =
		argumentList.find((argument) => !argument.startsWith("-")) || ".";
	const passArguments = argumentList.filter(
		(argument, index) =>
			argument.startsWith("-") || argumentList[index - 1]?.startsWith("-"),
	);
	return { directory, passArguments };
};

/**
 * Main entry point for the CLI.
 * @returns {Promise<void>}
 */
const main = async () => {
	try {
		if (cmd === "all") {
			const { directory, passArguments } = parseArguments(args);
			await runFullPipeline(directory, passArguments);
		} else if (cmd === "bundle") {
			const { directory, passArguments } = parseArguments(args);
			await runBundlePipeline(directory, passArguments);
		} else if (cmd === "watch") {
			const { directory, passArguments } = parseArguments(args);
			await runWatch(directory, passArguments);
		} else if (cmd === "init") {
			await runInit();
		} else if (cmd === "stats") {
			await runStats(args);
		} else if (cmd === "debug") {
			const tokenName = args.find((a) => !a.startsWith("-")) || "";
			await runDebug(tokenName, args);
		} else {
			await runScriptWithOutput(cmd, args);
		}
	} catch (problem) {
		console.error(problem);
		process.exit(1);
	}
};

main();
