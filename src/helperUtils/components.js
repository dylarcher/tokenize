import fs from "node:fs";
import path from "node:path";

import { getUniqueComponentName, walkDirectory } from "./files.js";

/**
 * @typedef {Object} ComponentDefinition
 * @property {string} name - Component name (PascalCase)
 * @property {string[]} stylePaths - Paths to SCSS/CSS files
 * @property {string[]} cssInJsPaths - Paths to files containing CSS-in-JS
 * @property {boolean} fromManifest - Whether this was defined in manifest
 */

/**
 * @typedef {Object} ManifestEntry
 * @property {string[]} [paths] - Style file paths
 * @property {boolean} [cssInJs] - Whether to scan for CSS-in-JS
 * @property {string[]} [cssInJsPaths] - Specific files to scan for CSS-in-JS
 */

/**
 * @typedef {Record<string, ManifestEntry>} ComponentManifest
 */

/**
 * Patterns for extracting CSS-in-JS styles.
 * TODO: Consider using @babel/parser for more robust AST-based extraction
 * if regex patterns prove insufficient for complex cases like:
 * - Template literals with interpolations
 * - Nested styled-components
 * - Dynamic style objects with computed properties
 */
const CSS_IN_JS_PATTERNS = {
	// styled-components: styled.div`...` or styled(Component)`...`
	styledComponents: /styled(?:\.[a-z]+|\([^)]+\))`([^`]+)`/gi,

	// emotion css prop: css`...` or css={css`...`}
	emotionCss: /css`([^`]+)`/gi,

	// emotion styled: styled.div`...`
	emotionStyled: /styled\.[a-z]+`([^`]+)`/gi,

	// Inline style objects: style={{ ... }}
	inlineStyles: /style=\{\{([^}]+)\}\}/gi,

	// sx prop (MUI/Theme UI): sx={{ ... }}
	sxProp: /sx=\{\{([^}]+)\}\}/gi,

	// Object styles: const styles = { ... }
	styleObjects:
		/(?:const|let|var)\s+styles?\s*=\s*\{([^}]+(?:\{[^}]*\}[^}]*)*)\}/gi,
};

/**
 * Extracts CSS-in-JS styles from a file's content.
 * @param {string} content - File content to parse
 * @returns {string[]} Array of extracted style strings
 */
export const extractCssInJs = (content) => {
	/** @type {string[]} */
	const extracted = [];

	for (const [, pattern] of Object.entries(CSS_IN_JS_PATTERNS)) {
		// Reset lastIndex for global patterns
		pattern.lastIndex = 0;
		let match = pattern.exec(content);
		while (match !== null) {
			if (match[1]) {
				extracted.push(match[1].trim());
			}
			match = pattern.exec(content);
		}
	}

	return extracted;
};

/**
 * Scans a directory for files containing CSS-in-JS.
 * @param {string} directory - Directory to scan
 * @param {string[]} [ignore] - Directories to ignore
 * @returns {Array<{file: string, styles: string[]}>} Files with extracted styles
 */
export const scanForCssInJs = (
	directory,
	ignore = ["node_modules", "dist", ".git"],
) => {
	const files = walkDirectory(directory, {
		extensions: [".tsx", ".jsx", ".ts", ".js"],
		ignore,
		includePartials: true,
	});

	/** @type {Array<{file: string, styles: string[]}>} */
	const results = [];

	for (const file of files) {
		try {
			const content = fs.readFileSync(file, "utf8");
			const styles = extractCssInJs(content);
			if (styles.length > 0) {
				results.push({ file, styles });
			}
		} catch {
			// Skip files that can't be read
		}
	}

	return results;
};

/**
 * Loads a component manifest file if it exists.
 * @param {string|null} manifestPath - Path to manifest file
 * @returns {ComponentManifest} Manifest contents or empty object
 */
export const loadComponentManifest = (manifestPath) => {
	if (!manifestPath || !fs.existsSync(manifestPath)) {
		return {};
	}

	try {
		const content = fs.readFileSync(manifestPath, "utf8");
		return JSON.parse(content);
	} catch {
		console.warn(`Warning: Could not parse manifest at ${manifestPath}`);
		return {};
	}
};

/**
 * Auto-detects components from a directory by scanning for style files.
 * @param {string} directory - Directory to scan
 * @param {Object} options - Detection options
 * @param {string[]} [options.extensions] - File extensions to look for
 * @param {string[]} [options.ignore] - Directories to ignore
 * @param {string[]} [options.excludePatterns] - Glob patterns to exclude
 * @param {boolean} [options.includeCssInJs] - Whether to also scan for CSS-in-JS
 * @returns {Map<string, ComponentDefinition>} Map of component name to definition
 */
export const detectComponents = (directory, options = {}) => {
	const {
		extensions = [".scss", ".css", ".sass"],
		ignore = ["node_modules", "dist", ".git", "build", "compiled"],
		excludePatterns = [],
		includeCssInJs = true,
	} = options;

	/** @type {Map<string, ComponentDefinition>} */
	const components = new Map();

	// Scan for style files
	const styleFiles = walkDirectory(directory, {
		extensions,
		ignore,
		excludePatterns,
		includePartials: false, // Don't include partials as separate components
	});

	// Group files by component
	for (const file of styleFiles) {
		const relativePath = path.relative(directory, file);
		const componentName = getUniqueComponentName(relativePath);

		if (!components.has(componentName)) {
			components.set(componentName, {
				name: componentName,
				stylePaths: [],
				cssInJsPaths: [],
				fromManifest: false,
			});
		}

		const component = components.get(componentName);
		if (component) {
			component.stylePaths.push(file);
		}
	}

	// Optionally scan for CSS-in-JS
	if (includeCssInJs) {
		const cssInJsResults = scanForCssInJs(directory, ignore);
		for (const { file } of cssInJsResults) {
			const relativePath = path.relative(directory, file);
			// Try to match to existing component or create new
			const componentName = getUniqueComponentName(
				relativePath.replace(/\.(tsx?|jsx?)$/, ".scss"),
			);

			if (!components.has(componentName)) {
				components.set(componentName, {
					name: componentName,
					stylePaths: [],
					cssInJsPaths: [],
					fromManifest: false,
				});
			}

			const component = components.get(componentName);
			if (component && !component.cssInJsPaths.includes(file)) {
				component.cssInJsPaths.push(file);
			}
		}
	}

	return components;
};

/**
 * Merges auto-detected components with manifest definitions.
 * Manifest entries extend (not override) auto-detected components.
 * @param {Map<string, ComponentDefinition>} detected - Auto-detected components
 * @param {ComponentManifest} manifest - Manifest definitions
 * @param {string} basePath - Base path for resolving manifest paths
 * @returns {Map<string, ComponentDefinition>} Merged component definitions
 */
export const mergeWithManifest = (detected, manifest, basePath) => {
	const merged = new Map(detected);

	for (const [name, entry] of Object.entries(manifest)) {
		const existingComponent = merged.get(name);

		if (existingComponent) {
			// Merge manifest paths with detected paths
			if (entry.paths) {
				for (const p of entry.paths) {
					const fullPath = path.resolve(basePath, p);
					if (!existingComponent.stylePaths.includes(fullPath)) {
						existingComponent.stylePaths.push(fullPath);
					}
				}
			}
			if (entry.cssInJsPaths) {
				for (const p of entry.cssInJsPaths) {
					const fullPath = path.resolve(basePath, p);
					if (!existingComponent.cssInJsPaths.includes(fullPath)) {
						existingComponent.cssInJsPaths.push(fullPath);
					}
				}
			}
		} else {
			// Create new component from manifest
			merged.set(name, {
				name,
				stylePaths: (entry.paths || []).map((p) => path.resolve(basePath, p)),
				cssInJsPaths: (entry.cssInJsPaths || []).map((p) =>
					path.resolve(basePath, p),
				),
				fromManifest: true,
			});
		}
	}

	return merged;
};

/**
 * Discovers all components from configured paths, optionally merging with manifest.
 * @param {Object} config - Configuration object
 * @param {string[]} [config.componentPaths] - Paths to scan for components
 * @param {string|null} [config.manifest] - Path to component manifest
 * @param {string[]} [config.ignore] - Directories to ignore
 * @param {string[]} [config.exclude] - Glob patterns to exclude
 * @returns {Map<string, ComponentDefinition>} All discovered components
 */
export const discoverComponents = (config) => {
	const {
		componentPaths = [],
		manifest = null,
		ignore = ["node_modules", "dist", ".git"],
		exclude = [],
	} = config;

	/** @type {Map<string, ComponentDefinition>} */
	let allComponents = new Map();

	// Scan each component path
	for (const componentPath of componentPaths) {
		const resolvedPath = path.resolve(componentPath);
		if (!fs.existsSync(resolvedPath)) {
			console.warn(`Warning: Component path does not exist: ${componentPath}`);
			continue;
		}

		const detected = detectComponents(resolvedPath, {
			ignore,
			excludePatterns: exclude,
			includeCssInJs: true,
		});

		// Merge into allComponents
		for (const [name, def] of detected) {
			if (allComponents.has(name)) {
				// Merge paths
				const existing = allComponents.get(name);
				if (existing) {
					existing.stylePaths.push(...def.stylePaths);
					existing.cssInJsPaths.push(...def.cssInJsPaths);
				}
			} else {
				allComponents.set(name, def);
			}
		}
	}

	// Merge with manifest if provided
	if (manifest) {
		const manifestData = loadComponentManifest(manifest);
		const manifestDir = path.dirname(path.resolve(manifest));
		allComponents = mergeWithManifest(allComponents, manifestData, manifestDir);
	}

	return allComponents;
};
