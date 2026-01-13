#!/usr/bin/env node
/**
 * Bundles all generated .d.ts files into a single dist/types.d.ts
 * @module types
 */

import { readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "../..");
const distDir = join(rootDir, "dist");
const outputFile = join(distDir, "types.d.ts");

/**
 * Recursively find all .d.ts files in a directory
 * @param {string} dir - Directory to search
 * @param {string[]} [files=[]] - Accumulator for found files
 * @returns {string[]} Array of .d.ts file paths
 */
function findDtsFiles(dir, files = []) {
	try {
		const entries = readdirSync(dir);
		for (const entry of entries) {
			const fullPath = join(dir, entry);
			const stat = statSync(fullPath);
			if (stat.isDirectory()) {
				findDtsFiles(fullPath, files);
			} else if (entry.endsWith(".d.ts") && entry !== "types.d.ts") {
				files.push(fullPath);
			}
		}
	} catch {
		// Directory doesn't exist
	}
	return files;
}

/**
 * Process a declaration file content for bundling
 * @param {string} content - File content
 * @param {string} filePath - Path to the file
 * @returns {string} Processed content
 */
function processContent(content, filePath) {
	const relativePath = relative(distDir, filePath).replace(/\.d\.ts$/, "");
	const moduleName = relativePath.replace(/\\/g, "/");

	const processed = content
		.replace(/^#!.*$/gm, "")
		.replace(/^export\s*\{\s*\}\s*;?\s*$/gm, "")
		.replace(/^declare\s+/gm, "")
		.replace(/\n{3,}/g, "\n\n")
		.trim();

	if (!processed) return "";

	return `declare module "${moduleName}" {\n${processed
		.split("\n")
		.map((line) => `    ${line}`)
		.join("\n")}\n}\n`;
}

/**
 * Main bundling function
 */
function bundle() {
	console.log("Bundling type declarations...");

	const dtsFiles = findDtsFiles(distDir);

	if (dtsFiles.length === 0) {
		console.log("No .d.ts files found to bundle.");
		return;
	}

	/** @type {string[]} */
	const modules = [];

	modules.push("/**");
	modules.push(" * Type declarations for tokenize");
	modules.push(" * @packageDocumentation");
	modules.push(" */");
	modules.push("");

	dtsFiles.sort();

	for (const file of dtsFiles) {
		const content = readFileSync(file, "utf-8");
		const processed = processContent(content, file);
		if (processed) {
			modules.push(processed);
		}
	}

	writeFileSync(outputFile, modules.join("\n"));
	console.log(`Created ${relative(rootDir, outputFile)}`);

	for (const file of dtsFiles) {
		rmSync(file);
	}

	cleanEmptyDirs(distDir);

	console.log("Cleaned up individual declaration files.");
}

/**
 * Recursively remove empty directories
 * @param {string} dir - Directory to clean
 */
function cleanEmptyDirs(dir) {
	try {
		const entries = readdirSync(dir);
		for (const entry of entries) {
			const fullPath = join(dir, entry);
			const stat = statSync(fullPath);
			if (stat.isDirectory()) {
				cleanEmptyDirs(fullPath);
				const remaining = readdirSync(fullPath);
				if (remaining.length === 0) {
					rmSync(fullPath, { recursive: true });
				}
			}
		}
	} catch {
		// Directory doesn't exist
	}
}

bundle();
