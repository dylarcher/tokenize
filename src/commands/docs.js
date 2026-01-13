#!/usr/bin/env node
/**
 * Documentation generator - Creates docs/index.html from JSDoc, README, and configs
 * @module docs
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getFlagValue, hasFlag } from "../helperUtils/config.js";
import { walkDirectory } from "../helperUtils/files.js";
import { escapeHtml, markdownToHtml } from "../helperUtils/markdown.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "../..");

/**
 * @typedef {Object} JSDocTag
 * @property {string} tag - Tag name (param, returns, typedef, etc.)
 * @property {string|null} type - Type annotation
 * @property {string|null} name - Parameter/property name
 * @property {string} description - Tag description
 */

/**
 * @typedef {Object} JSDocBlock
 * @property {string} raw - Raw JSDoc comment text
 * @property {string} description - Main description
 * @property {JSDocTag[]} tags - Parsed tags
 * @property {number} line - Line number in source
 * @property {string} file - Source file path
 * @property {string|null} associatedName - Name of associated function/const
 */

/**
 * @typedef {Object} TypeDef
 * @property {string} name - Type name
 * @property {string} type - Base type
 * @property {string} description - Type description
 * @property {JSDocTag[]} properties - Object properties
 * @property {string} file - Source file
 */

/**
 * @typedef {Object} FunctionDoc
 * @property {string} name - Function name
 * @property {string} description - Function description
 * @property {JSDocTag[]} params - Parameters
 * @property {JSDocTag|null} returns - Return value
 * @property {string} file - Source file
 * @property {boolean} exported - Is exported
 */

/**
 * @typedef {Object} ConfigSection
 * @property {string} name - Section name
 * @property {Record<string, unknown>} values - Section values
 */

/**
 * @typedef {Object} ConfigDoc
 * @property {string} file - Config file name
 * @property {string} format - File format
 * @property {ConfigSection[]} sections - Configuration sections
 * @property {unknown} raw - Raw parsed content
 */

/**
 * @typedef {Object} DocsData
 * @property {string} readme - Rendered README HTML
 * @property {TypeDef[]} typedefs - Type definitions
 * @property {FunctionDoc[]} functions - Exported functions
 * @property {ConfigDoc[]} configs - Configuration files
 * @property {Record<string, unknown>} packageJson - package.json content
 * @property {string} version - Package version
 * @property {string} generated - Generation timestamp
 * @property {string[]} sourceFiles - List of parsed source files
 */

/**
 * Extracts JSDoc blocks from file content.
 * @param {string} content - File content
 * @param {string} filePath - File path for context
 * @returns {JSDocBlock[]}
 */
const extractJSDocBlocks = (content, filePath) => {
	/** @type {JSDocBlock[]} */
	const blocks = [];
	const jsdocRegex = /\/\*\*\s*([\s\S]*?)\s*\*\//g;
	const matches = content.matchAll(jsdocRegex);

	for (const match of matches) {
		const raw = match[1];
		const lineNumber = content.slice(0, match.index).split("\n").length;

		// Find associated name (function or const after the JSDoc)
		const afterComment = content.slice(match.index + match[0].length);
		const nameMatch = afterComment.match(
			/^\s*(?:export\s+)?(?:const|let|var|function|async\s+function)\s+(\w+)/,
		);

		blocks.push({
			raw,
			description: extractDescription(raw),
			tags: extractTags(raw),
			line: lineNumber,
			file: filePath,
			associatedName: nameMatch ? nameMatch[1] : null,
		});
	}

	return blocks;
};

/**
 * Extracts main description from JSDoc block.
 * @param {string} raw - Raw JSDoc content
 * @returns {string}
 */
const extractDescription = (raw) => {
	const lines = raw.split("\n").map((line) => line.replace(/^\s*\*\s?/, ""));
	const descLines = [];

	for (const line of lines) {
		if (line.startsWith("@")) break;
		descLines.push(line);
	}

	return descLines.join(" ").trim();
};

/**
 * Extracts tags from JSDoc block.
 * @param {string} raw - Raw JSDoc content
 * @returns {JSDocTag[]}
 */
const extractTags = (raw) => {
	/** @type {JSDocTag[]} */
	const tags = [];
	const normalized = raw.replace(/\n\s*\*\s?/g, "\n").trim();
	const tagMatches = normalized.matchAll(
		/@(\w+)(?:\s+\{([^}]*)\})?(?:\s+(\[?\w+\]?))?(?:\s*-?\s*)?([^@]*)/g,
	);

	for (const match of tagMatches) {
		const [, tag, type, name, desc] = match;
		tags.push({
			tag,
			type: type || null,
			name: name || null,
			description: (desc || "").trim().replace(/\n/g, " "),
		});
	}

	return tags;
};

/**
 * Extracts type definitions from JSDoc blocks.
 * @param {JSDocBlock[]} blocks - All JSDoc blocks
 * @returns {TypeDef[]}
 */
const extractTypeDefs = (blocks) => {
	/** @type {TypeDef[]} */
	const typedefs = [];

	for (const block of blocks) {
		const typedefTag = block.tags.find((t) => t.tag === "typedef");
		if (!typedefTag) continue;

		const properties = block.tags.filter((t) => t.tag === "property");

		typedefs.push({
			name: typedefTag.name || "Unknown",
			type: typedefTag.type || "Object",
			description: block.description || typedefTag.description,
			properties,
			file: path.relative(projectRoot, block.file),
		});
	}

	return typedefs;
};

/**
 * Extracts function documentation from JSDoc blocks.
 * @param {JSDocBlock[]} blocks - All JSDoc blocks
 * @param {string} content - File content for export detection
 * @returns {FunctionDoc[]}
 */
const extractFunctions = (blocks, content) => {
	/** @type {FunctionDoc[]} */
	const functions = [];

	for (const block of blocks) {
		if (!block.associatedName) continue;
		if (block.tags.some((t) => t.tag === "typedef" || t.tag === "module"))
			continue;

		const params = block.tags.filter((t) => t.tag === "param");
		const returns =
			block.tags.find((t) => t.tag === "returns" || t.tag === "return") || null;

		// Check if exported
		const exportRegex = new RegExp(
			`export\\s+(?:const|let|var|function|async\\s+function)\\s+${block.associatedName}\\b`,
		);
		const exported = exportRegex.test(content);

		functions.push({
			name: block.associatedName,
			description: block.description,
			params,
			returns,
			file: path.relative(projectRoot, block.file),
			exported,
		});
	}

	return functions;
};

/**
 * Parses a TOML file into sections.
 * @param {string} content - TOML content
 * @returns {ConfigSection[]}
 */
const parseToml = (content) => {
	/** @type {ConfigSection[]} */
	const sections = [];
	let currentSection = {
		name: "root",
		values: /** @type {Record<string, unknown>} */ ({}),
	};

	for (const line of content.split("\n")) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("#")) continue;

		const sectionMatch = trimmed.match(/^\[([^\]]+)\]$/);
		if (sectionMatch) {
			if (Object.keys(currentSection.values).length > 0) {
				sections.push(currentSection);
			}
			currentSection = { name: sectionMatch[1], values: {} };
			continue;
		}

		const kvMatch = trimmed.match(/^(\w+)\s*=\s*(.+)$/);
		if (kvMatch) {
			const [, key, rawValue] = kvMatch;
			let value = rawValue.trim();

			// Parse value type
			if (value === "true") value = true;
			else if (value === "false") value = false;
			else if (/^\d+\.?\d*$/.test(value)) value = Number.parseFloat(value);
			else if (value.startsWith('"') && value.endsWith('"'))
				value = value.slice(1, -1);
			else if (value.startsWith("[")) {
				try {
					value = JSON.parse(value.replace(/'/g, '"'));
				} catch {
					// Keep as string if parse fails
				}
			}

			currentSection.values[key] = value;
		}
	}

	if (Object.keys(currentSection.values).length > 0) {
		sections.push(currentSection);
	}

	return sections;
};

/**
 * Parses a configuration file.
 * @param {string} filePath - Path to config file
 * @returns {Promise<ConfigDoc|null>}
 */
const parseConfigFile = async (filePath) => {
	const fullPath = path.resolve(projectRoot, filePath);
	if (!fs.existsSync(fullPath)) return null;

	const ext = path.extname(filePath);
	const content = fs.readFileSync(fullPath, "utf8");

	try {
		if (ext === ".json") {
			const parsed = JSON.parse(content);
			return {
				file: path.basename(filePath),
				format: "json",
				sections: [{ name: "root", values: parsed }],
				raw: parsed,
			};
		}

		if (ext === ".toml") {
			const sections = parseToml(content);
			return {
				file: path.basename(filePath),
				format: "toml",
				sections,
				raw: sections,
			};
		}

		if (ext === ".js" && filePath.includes("config")) {
			const module = await import(fullPath);
			const config = module.default || module;
			return {
				file: path.basename(filePath),
				format: "javascript",
				sections: [{ name: "default", values: config }],
				raw: config,
			};
		}
	} catch (error) {
		console.error(`Failed to parse ${filePath}:`, error.message);
	}

	return null;
};

/**
 * Generates HTML for a type definition.
 * @param {TypeDef} typedef - Type definition
 * @returns {string}
 */
const generateTypeDefHtml = (typedef) => {
	const propsHtml = typedef.properties.length
		? `<table class="props-table">
			<thead><tr><th>Property</th><th>Type</th><th>Description</th></tr></thead>
			<tbody>
			${typedef.properties
				.map((p) => {
					// Clean up property name (remove optional brackets)
					const propName = (p.name || "").replace(/^\[|\]$/g, "");
					const isOptional = (p.name || "").startsWith("[");
					return `<tr>
					<td><code>${escapeHtml(propName)}${isOptional ? "?" : ""}</code></td>
					<td><code>${escapeHtml(p.type || "any")}</code></td>
					<td>${escapeHtml(p.description)}</td>
				</tr>`;
				})
				.join("")}
			</tbody>
		</table>`
		: "";

	return `<article class="typedef-card">
		<h4><code>${escapeHtml(typedef.name)}</code></h4>
		<p class="type-info">Type: <code>${escapeHtml(typedef.type)}</code></p>
		<p>${escapeHtml(typedef.description)}</p>
		${propsHtml}
		<p class="file-ref">Defined in: <code>${escapeHtml(typedef.file)}</code></p>
	</article>`;
};

/**
 * Generates HTML for a function.
 * @param {FunctionDoc} fn - Function documentation
 * @returns {string}
 */
const generateFunctionHtml = (fn) => {
	const paramsHtml = fn.params.length
		? `<div class="params">
			<h5>Parameters</h5>
			<ul>
			${fn.params
				.map((p) => {
					// Clean up parameter name (remove optional brackets)
					const paramName = (p.name || "").replace(/^\[|\]$/g, "");
					const isOptional = (p.name || "").startsWith("[");
					return `<li><code>${escapeHtml(paramName)}${isOptional ? "?" : ""}</code> <span class="param-type">{${escapeHtml(p.type || "any")}}</span> - ${escapeHtml(p.description)}</li>`;
				})
				.join("")}
			</ul>
		</div>`
		: "";

	const returnsHtml = fn.returns
		? `<div class="returns">
			<h5>Returns</h5>
			<p><code>{${escapeHtml(fn.returns.type || "void")}}</code> ${escapeHtml(fn.returns.description)}</p>
		</div>`
		: "";

	return `<article class="function-card">
		<h4>
			${fn.exported ? '<span class="export-badge">export</span>' : ""}
			<code>${escapeHtml(fn.name)}()</code>
		</h4>
		<p>${escapeHtml(fn.description)}</p>
		${paramsHtml}
		${returnsHtml}
		<p class="file-ref">Defined in: <code>${escapeHtml(fn.file)}</code></p>
	</article>`;
};

/**
 * Generates HTML for a config file.
 * @param {ConfigDoc} config - Configuration document
 * @returns {string}
 */
const generateConfigHtml = (config) => {
	const sectionsHtml = config.sections
		.map((section) => {
			const entries = Object.entries(section.values);
			if (entries.length === 0) return "";

			const isNested = entries.some(
				([, v]) => typeof v === "object" && v !== null,
			);

			if (isNested && config.format === "json") {
				return `<pre><code class="language-json">${escapeHtml(JSON.stringify(section.values, null, 2))}</code></pre>`;
			}

			return `
			${section.name !== "root" && section.name !== "default" ? `<h5>[${escapeHtml(section.name)}]</h5>` : ""}
			<table class="config-table">
				<thead><tr><th>Key</th><th>Value</th></tr></thead>
				<tbody>
				${entries
					.map(([key, value]) => {
						const displayValue =
							typeof value === "object" ? JSON.stringify(value) : String(value);
						return `<tr><td><code>${escapeHtml(key)}</code></td><td><code>${escapeHtml(displayValue)}</code></td></tr>`;
					})
					.join("")}
				</tbody>
			</table>`;
		})
		.join("");

	return `<article class="config-card">
		<h4>${escapeHtml(config.file)}</h4>
		<p class="format-badge">${escapeHtml(config.format)}</p>
		${sectionsHtml}
	</article>`;
};

/**
 * Generates the package scripts section.
 * @param {Record<string, unknown>} pkg - package.json content
 * @returns {string}
 */
const generateScriptsSection = (pkg) => {
	const scripts = /** @type {Record<string, string>} */ (pkg.scripts || {});
	if (Object.keys(scripts).length === 0) return "";

	return `<table class="scripts-table">
		<thead><tr><th>Script</th><th>Command</th></tr></thead>
		<tbody>
		${Object.entries(scripts)
			.map(
				([name, cmd]) =>
					`<tr><td><code>bun run ${escapeHtml(name)}</code></td><td><code>${escapeHtml(cmd)}</code></td></tr>`,
			)
			.join("")}
		</tbody>
	</table>`;
};

/**
 * Generates the project structure section.
 * @param {string[]} sourceFiles - List of source files
 * @returns {string}
 */
const generateStructureSection = (sourceFiles) => {
	const tree = {};

	for (const file of sourceFiles) {
		const parts = file.split("/");
		let current = tree;
		for (let i = 0; i < parts.length; i++) {
			const part = parts[i];
			if (i === parts.length - 1) {
				current[part] = null;
			} else {
				current[part] = current[part] || {};
				current = current[part];
			}
		}
	}

	const renderTree = (obj, indent = "") => {
		return Object.entries(obj)
			.map(([key, value]) => {
				if (value === null) {
					return `${indent}├── ${key}`;
				}
				return `${indent}├── ${key}/\n${renderTree(value, `${indent}│   `)}`;
			})
			.join("\n");
	};

	return `<pre><code>tokenize/\n${renderTree(tree)}</code></pre>`;
};

/**
 * Generates the full HTML documentation page.
 * @param {DocsData} data - Documentation data
 * @returns {string}
 */
const generateHtml = (data) => {
	const pkg = data.packageJson;
	const version = /** @type {string} */ (pkg.version) || "0.0.0";
	const name =
		/** @type {string} */ (pkg.displayName || pkg.name) || "Tokenize";
	const description = /** @type {string} */ (pkg.description) || "";

	return `<!DOCTYPE html>
<html lang="en" dir="ltr">

<head>
	<meta charset="utf-8">
	<meta name="viewport" content="width=device-width, initial-scale=1">
	<meta name="description" content="${escapeHtml(description)}">
	<meta name="generator" content="tokenize docs generator">
	<meta name="theme-color" content="#6b7280" media="(prefers-color-scheme: light)">
	<meta name="theme-color" content="#a78bfa" media="(prefers-color-scheme: dark)">
	<link rel="icon" type="image/svg+xml" href="favicon.svg">
	<link rel="mask-icon" href="mask-icon.svg" color="#6b7280">
	<link rel="icon" type="image/x-icon" href="static/light/favicon.ico" media="not (prefers-color-scheme: dark)">
	<link rel="apple-touch-icon" href="static/light/apple-touch-icon.png" media="not (prefers-color-scheme: dark)">
	<link rel="manifest" href="static/light/manifest.json" media="not (prefers-color-scheme: dark)">
	<link rel="icon" type="image/x-icon" href="static/dark/favicon.ico" media="(prefers-color-scheme: dark)">
	<link rel="apple-touch-icon" href="static/dark/apple-touch-icon.png" media="(prefers-color-scheme: dark)">
	<link rel="manifest" href="static/dark/manifest.json" media="(prefers-color-scheme: dark)">
	<title>${escapeHtml(name)} - Documentation</title>
	<style>
		*,
		*::before,
		*::after {
			box-sizing: border-box;
		}

		:root {
			--color-bg: #f8fafc;
			--color-bg-alt: #f1f5f9;
			--color-text: #1e293b;
			--color-text-muted: #64748b;
			--color-accent: #6366f1;
			--color-border: #e2e8f0;
			--color-code-bg: #1e293b;
			--color-code-text: #e2e8f0;
			--color-success: #10b981;
			--font-sans: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
			--font-mono: ui-monospace, "SF Mono", "Cascadia Code", Consolas, monospace;
		}

		@media (prefers-color-scheme: dark) {
			:root {
				--color-bg: #0f172a;
				--color-bg-alt: #1e293b;
				--color-text: #f1f5f9;
				--color-text-muted: #94a3b8;
				--color-accent: #a78bfa;
				--color-border: #334155;
				--color-code-bg: #020617;
				--color-code-text: #e2e8f0;
			}
		}

		html {
			color-scheme: light dark;
			scroll-behavior: smooth;
		}

		body {
			margin: 0;
			padding: 0;
			font-family: var(--font-sans);
			background-color: var(--color-bg);
			color: var(--color-text);
			line-height: 1.6;
			min-height: 100dvh;
			display: flex;
			flex-direction: column;
		}

		main {
			flex: 1;
			max-width: 72rem;
			margin: 0 auto;
			padding: 2rem 1.5rem;
			width: 100%;
		}

		header {
			text-align: center;
			padding: 3rem 1rem;
			border-bottom: 1px solid var(--color-border);
			background: var(--color-bg-alt);
		}

		.logo {
			width: 5rem;
			height: 5rem;
			margin-bottom: 1rem;
		}

		h1 {
			margin: 0 0 0.5rem;
			font-size: 2.5rem;
			font-weight: 700;
			letter-spacing: -0.02em;
		}

		.tagline {
			margin: 0;
			font-size: 1.125rem;
			color: var(--color-text-muted);
		}

		.version {
			display: inline-block;
			margin-top: 1rem;
			padding: 0.25rem 0.75rem;
			font-size: 0.875rem;
			font-family: var(--font-mono);
			background: var(--color-bg);
			border: 1px solid var(--color-border);
			border-radius: 9999px;
			color: var(--color-text-muted);
		}

		nav {
			background: var(--color-bg-alt);
			border-bottom: 1px solid var(--color-border);
			padding: 0.75rem 1rem;
			position: sticky;
			top: 0;
			z-index: 100;
		}

		nav ul {
			display: flex;
			gap: 1.5rem;
			list-style: none;
			margin: 0;
			padding: 0;
			justify-content: center;
			flex-wrap: wrap;
		}

		nav a {
			color: var(--color-text-muted);
			text-decoration: none;
			font-size: 0.875rem;
			font-weight: 500;
			transition: color 0.2s;
		}

		nav a:hover {
			color: var(--color-accent);
		}

		section {
			margin: 3rem 0;
			scroll-margin-top: 4rem;
		}

		h2 {
			font-size: 1.5rem;
			font-weight: 600;
			margin: 0 0 1rem;
			padding-bottom: 0.5rem;
			border-bottom: 2px solid var(--color-accent);
			display: inline-block;
		}

		h3 {
			font-size: 1.25rem;
			font-weight: 600;
			margin: 2rem 0 1rem;
			color: var(--color-text);
		}

		h4 {
			font-size: 1rem;
			font-weight: 600;
			margin: 0 0 0.5rem;
			font-family: var(--font-mono);
		}

		h5 {
			font-size: 0.875rem;
			font-weight: 600;
			margin: 1rem 0 0.5rem;
			color: var(--color-text-muted);
		}

		pre {
			background: var(--color-code-bg);
			border-radius: 0.5rem;
			padding: 1.25rem;
			overflow-x: auto;
			margin: 1rem 0;
		}

		pre code {
			font-family: var(--font-mono);
			font-size: 0.875rem;
			color: var(--color-code-text);
			line-height: 1.7;
		}

		code {
			font-family: var(--font-mono);
			font-size: 0.875em;
			background: var(--color-bg-alt);
			padding: 0.125rem 0.375rem;
			border-radius: 0.25rem;
		}

		pre code {
			background: none;
			padding: 0;
		}

		table {
			width: 100%;
			border-collapse: collapse;
			margin: 1rem 0;
			font-size: 0.875rem;
		}

		th, td {
			padding: 0.75rem;
			text-align: left;
			border-bottom: 1px solid var(--color-border);
		}

		th {
			background: var(--color-bg-alt);
			font-weight: 600;
		}

		.typedef-card,
		.function-card,
		.config-card {
			background: var(--color-bg-alt);
			border: 1px solid var(--color-border);
			border-radius: 0.5rem;
			padding: 1.25rem;
			margin: 1rem 0;
		}

		.typedef-card:hover,
		.function-card:hover,
		.config-card:hover {
			border-color: var(--color-accent);
		}

		.type-info,
		.format-badge {
			font-size: 0.75rem;
			color: var(--color-text-muted);
			margin: 0.25rem 0;
		}

		.file-ref {
			font-size: 0.75rem;
			color: var(--color-text-muted);
			margin-top: 1rem;
			padding-top: 0.5rem;
			border-top: 1px solid var(--color-border);
		}

		.export-badge {
			display: inline-block;
			background: var(--color-success);
			color: white;
			font-size: 0.625rem;
			padding: 0.125rem 0.375rem;
			border-radius: 0.25rem;
			margin-right: 0.5rem;
			vertical-align: middle;
			text-transform: uppercase;
			font-family: var(--font-sans);
			font-weight: 600;
		}

		.params ul,
		.returns p {
			margin: 0.5rem 0;
		}

		.param-type {
			color: var(--color-accent);
			font-size: 0.875em;
		}

		.readme-content h1 {
			font-size: 2rem;
		}

		.readme-content h2 {
			font-size: 1.5rem;
			border-bottom: 1px solid var(--color-border);
			display: block;
			margin-top: 2rem;
		}

		.readme-content h3 {
			font-size: 1.25rem;
		}

		.props-table,
		.config-table,
		.scripts-table {
			font-size: 0.8125rem;
		}

		footer {
			text-align: center;
			padding: 2rem 1rem;
			border-top: 1px solid var(--color-border);
			font-size: 0.875rem;
			color: var(--color-text-muted);
		}

		footer a {
			color: var(--color-accent);
			text-decoration: none;
		}

		footer a:hover {
			text-decoration: underline;
		}

		.grid {
			display: grid;
			gap: 1rem;
			grid-template-columns: repeat(auto-fit, minmax(20rem, 1fr));
		}

		@media (max-width: 640px) {
			header {
				padding: 2rem 1rem;
			}

			h1 {
				font-size: 2rem;
			}

			.logo {
				width: 4rem;
				height: 4rem;
			}

			main {
				padding: 1.5rem 1rem;
			}

			nav ul {
				gap: 1rem;
			}
		}
	</style>
</head>

<body>
	<header>
		<img class="logo" src="favicon.svg" alt="${escapeHtml(name)} logo" width="80" height="80">
		<h1>${escapeHtml(name)}</h1>
		<p class="tagline">${escapeHtml(description)}</p>
		<span class="version">v${escapeHtml(version)}</span>
	</header>

	<nav>
		<ul>
			<li><a href="#overview">Overview</a></li>
			<li><a href="#scripts">Scripts</a></li>
			<li><a href="#structure">Structure</a></li>
			<li><a href="#types">Types</a></li>
			<li><a href="#functions">Functions</a></li>
			<li><a href="#config">Configuration</a></li>
		</ul>
	</nav>

	<main>
		<section id="overview" aria-labelledby="overview-heading">
			<h2 id="overview-heading">Overview</h2>
			<div class="readme-content">
				${data.readme}
			</div>
		</section>

		<section id="scripts" aria-labelledby="scripts-heading">
			<h2 id="scripts-heading">Package Scripts</h2>
			${generateScriptsSection(pkg)}
		</section>

		<section id="structure" aria-labelledby="structure-heading">
			<h2 id="structure-heading">Project Structure</h2>
			${generateStructureSection(data.sourceFiles)}
		</section>

		<section id="types" aria-labelledby="types-heading">
			<h2 id="types-heading">Type Definitions</h2>
			<p>${data.typedefs.length} type definition${data.typedefs.length !== 1 ? "s" : ""} found</p>
			<div class="grid">
				${data.typedefs.map(generateTypeDefHtml).join("\n")}
			</div>
		</section>

		<section id="functions" aria-labelledby="functions-heading">
			<h2 id="functions-heading">Functions</h2>
			<p>${data.functions.filter((f) => f.exported).length} exported function${data.functions.filter((f) => f.exported).length !== 1 ? "s" : ""}</p>
			<div class="grid">
				${data.functions
					.filter((f) => f.exported)
					.map(generateFunctionHtml)
					.join("\n")}
			</div>
		</section>

		<section id="config" aria-labelledby="config-heading">
			<h2 id="config-heading">Configuration</h2>
			<div class="grid">
				${data.configs.map(generateConfigHtml).join("\n")}
			</div>
		</section>
	</main>

	<footer>
		<p>Generated on ${escapeHtml(data.generated)} &middot; Built with vanilla JavaScript</p>
	</footer>
</body>

</html>`;
};

/**
 * Main entry point.
 * @returns {Promise<void>}
 */
const main = async () => {
	const args = process.argv.slice(2);
	const quiet = hasFlag(args, ["-Q", "--quiet"]);
	const verbose = hasFlag(args, ["-V", "--verbose"]);
	const outputPath = getFlagValue(args, ["-o", "--output"], "docs/index.html");
	const skipReadme = hasFlag(args, ["--no-readme"]);
	const skipConfig = hasFlag(args, ["--no-config"]);

	if (!quiet) console.info("Generating documentation...");

	// Collect source files
	const sourceFiles = walkDirectory(path.join(projectRoot, "src"), {
		extensions: [".js"],
		ignore: ["node_modules", "dist", ".git"],
	});

	if (verbose) console.info(`Found ${sourceFiles.length} source files`);

	// Parse JSDoc from all files
	/** @type {JSDocBlock[]} */
	const allBlocks = [];
	/** @type {FunctionDoc[]} */
	const allFunctions = [];

	for (const file of sourceFiles) {
		const content = fs.readFileSync(file, "utf8");
		const blocks = extractJSDocBlocks(content, file);
		allBlocks.push(...blocks);

		const functions = extractFunctions(blocks, content);
		allFunctions.push(...functions);
	}

	if (verbose) console.info(`Extracted ${allBlocks.length} JSDoc blocks`);

	// Extract type definitions
	const typedefs = extractTypeDefs(allBlocks);
	if (verbose) console.info(`Found ${typedefs.length} type definitions`);

	// Parse README
	let readmeHtml = "";
	if (!skipReadme) {
		const readmePath = path.join(projectRoot, "README.md");
		if (fs.existsSync(readmePath)) {
			const readmeContent = fs.readFileSync(readmePath, "utf8");
			readmeHtml = markdownToHtml(readmeContent);
			if (verbose) console.info("Parsed README.md");
		}
	}

	// Parse config files
	/** @type {ConfigDoc[]} */
	const configs = [];
	if (!skipConfig) {
		const configFiles = [
			"package.json",
			"bunfig.toml",
			"biome.json",
			"tsconfig.json",
			"tokenize.config.js",
		];

		for (const configFile of configFiles) {
			const config = await parseConfigFile(configFile);
			if (config) {
				configs.push(config);
				if (verbose) console.info(`Parsed ${configFile}`);
			}
		}
	}

	// Read package.json
	const packageJsonPath = path.join(projectRoot, "package.json");
	const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));

	// Assemble documentation data
	/** @type {DocsData} */
	const docsData = {
		readme: readmeHtml,
		typedefs,
		functions: allFunctions,
		configs,
		packageJson,
		version: packageJson.version,
		generated: new Date().toISOString(),
		sourceFiles: sourceFiles.map((f) => path.relative(projectRoot, f)),
	};

	// Generate HTML
	const html = generateHtml(docsData);

	// Write output
	const fullOutputPath = path.resolve(projectRoot, outputPath);
	const outputDir = path.dirname(fullOutputPath);
	if (!fs.existsSync(outputDir)) {
		fs.mkdirSync(outputDir, { recursive: true });
	}

	fs.writeFileSync(fullOutputPath, html);

	if (!quiet) {
		console.info(`Documentation generated: ${outputPath}`);
		console.info(`  - ${typedefs.length} type definitions`);
		console.info(
			`  - ${allFunctions.filter((f) => f.exported).length} exported functions`,
		);
		console.info(`  - ${configs.length} config files`);
	}
};

main().catch((error) => {
	console.error("Documentation generation failed:", error);
	process.exit(1);
});
