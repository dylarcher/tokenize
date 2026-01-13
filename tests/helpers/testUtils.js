import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export const mocks_DIR = join(__dirname, "../mocks");
export const INPUTS_DIR = join(mocks_DIR, "src");
export const OUTPUTS_DIR = join(mocks_DIR, "dist");

/**
 * Loads a fixture file as a string.
 * @param {string} relativePath - Path relative to mocks directory
 * @returns {string} File contents
 */
export const loadFixture = (relativePath) => {
	const fullPath = join(mocks_DIR, relativePath);
	return readFileSync(fullPath, "utf-8");
};

/**
 * Loads a JSON fixture file.
 * @param {string} relativePath - Path relative to mocks directory
 * @returns {object} Parsed JSON
 */
export const loadJsonFixture = (relativePath) => {
	return JSON.parse(loadFixture(relativePath));
};

/**
 * Checks if a fixture exists.
 * @param {string} relativePath - Path relative to mocks directory
 * @returns {boolean} True if file exists
 */
export const fixtureExists = (relativePath) => {
	return existsSync(join(mocks_DIR, relativePath));
};

/**
 * Creates a temporary test directory path.
 * @param {string} name - Directory name
 * @returns {string} Full path to temp directory
 */
export const getTempDir = (name) => {
	return join(OUTPUTS_DIR, ".tmp", name);
};

/**
 * Rounds a number to specified decimal places for comparison.
 * @param {number} num - Number to round
 * @param {number} [decimals=2] - Decimal places
 * @returns {number} Rounded number
 */
export const roundTo = (num, decimals = 2) => {
	const factor = 10 ** decimals;
	return Math.round(num * factor) / factor;
};
