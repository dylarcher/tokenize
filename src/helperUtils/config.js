import fs from "node:fs";
import path from "node:path";

/**
 * @typedef {Object} Config
 * @property {string} [scanDir] - Directory to scan for styles
 * @property {string} [outDir] - Output directory for generated files
 * @property {string} [compileOutDir] - Output directory for compiled CSS
 * @property {string[]} [exclude] - Glob patterns to exclude
 * @property {string[]} [ignore] - Directory names to ignore
 * @property {RegExp[]} [componentPatterns] - Patterns to identify component files
 * @property {string[]} [outputFormats] - Output formats (json, scss, css)
 * @property {number} [spacingBase] - Base unit for spacing scale
 */

/**
 * Loads configuration from a file specified via CLI arguments or default path.
 * @param {string[]} [commandLineArguments=process.argv] - Command line arguments array
 * @returns {Promise<Config>} Configuration object
 */
export const loadConfiguration = (commandLineArguments = process.argv) => {
	const configFlagIndex = commandLineArguments.findIndex(
		(argument) => argument === "-c" || argument === "-C" || argument === "--config",
	);
	const configurationPath =
		configFlagIndex > -1
			? commandLineArguments[configFlagIndex + 1]
			: "tokenize.config.js";

	if (fs.existsSync(configurationPath)) {
		const fullPath = path.resolve(configurationPath);
		return import(fullPath)
			.then((module) => module.default || module)
			.catch(() => ({}));
	}
	return Promise.resolve({});
};

/**
 * Gets the output directory from CLI arguments or config.
 * @param {string[]} commandLineArguments - Command line arguments array
 * @param {Object} configuration - Configuration object
 * @param {string} [configuration.outDir] - Output directory from config
 * @param {string} [defaultDirectory='./tokens'] - Default output directory
 * @returns {string} Output directory path
 */
export const getOutputDirectory = (
	commandLineArguments,
	configuration,
	defaultDirectory = "./tokens",
) => {
	const outputFlagIndex = commandLineArguments.findIndex(
		(argument) =>
			argument === "-o" || argument === "-O" || argument === "--out" || argument === "--dist",
	);
	return outputFlagIndex > -1
		? commandLineArguments[outputFlagIndex + 1]
		: configuration.outDir || defaultDirectory;
};

/**
 * Gets exclude patterns from CLI arguments and config.
 * @param {string[]} commandLineArguments - Command line arguments array
 * @param {Object} configuration - Configuration object
 * @param {string[]} [configuration.exclude] - Exclude patterns from config
 * @param {string[]} [excludePatterns=[]] - Exclude patterns from CLI
 * @returns {string[]} Array of exclude patterns
 */
export const getExcludePatterns = (
	commandLineArguments,
	configuration,
	excludePatterns = [],
) => {
	commandLineArguments.forEach((argument, index) => {
		if (
			(argument === "-e" || argument === "-X" || argument === "--exclude") &&
			commandLineArguments[index + 1]
		) {
			excludePatterns.push(commandLineArguments[index + 1]);
		}
	});
	return [...excludePatterns, ...(configuration.exclude || [])];
};

/**
 * Checks if a CLI flag is present in arguments.
 * @param {string[]} args - Command line arguments
 * @param {string[]} flags - Flags to check for
 * @returns {boolean} True if any flag is present
 */
export const hasFlag = (args, flags) => {
	return args.some((arg) => flags.includes(arg));
};

/**
 * Gets a flag value from CLI arguments.
 * @param {string[]} args - Command line arguments
 * @param {string[]} flags - Flags to check for
 * @param {string} [defaultValue] - Default value if flag not found
 * @returns {string|undefined} Flag value or default
 */
export const getFlagValue = (args, flags, defaultValue) => {
	const index = args.findIndex((arg) => flags.includes(arg));
	if (index > -1 && args[index + 1] && !args[index + 1].startsWith("-")) {
		return args[index + 1];
	}
	return defaultValue;
};
