import fs from "node:fs";
import path from "node:path";

/**
 * Converts a glob pattern to a regular expression.
 * @param {string} globPattern - Glob pattern string
 * @returns {RegExp} Regular expression matching the glob pattern
 */
export const convertGlobPatternToRegularExpression = (globPattern) => {
	const regexPattern = globPattern
		.replace(/[.+^${}()|[\]\\]/g, "\\$&")
		.replace(/\*\*/g, "{{GLOBSTAR}}")
		.replace(/\*/g, "[^/]*")
		.replace(/\?/g, "[^/]")
		.replace(/{{GLOBSTAR}}/g, ".*");
	return new RegExp(
		`^${regexPattern}$|/${regexPattern}$|^${regexPattern}/|/${regexPattern}/`,
	);
};

/**
 * Checks if a filepath matches any of the exclude patterns.
 * @param {string} filePath - File path to check
 * @param {string[]} patterns - Array of glob patterns
 * @returns {boolean} True if filepath matches any pattern
 */
export const matchesExcludePattern = (filePath, patterns) => {
	const normalizedPath = filePath.replace(/\\/g, "/");
	return patterns.some((pattern) =>
		convertGlobPatternToRegularExpression(pattern).test(normalizedPath),
	);
};

/**
 * Default patterns for identifying component files.
 * @type {RegExp[]}
 */
export const defaultComponentPatterns = [
	/\.component\.s?css$/i,
	/\.module\.s?css$/i,
	/_component\.s?css$/i,
	/components\/[^/]+\/[^/]+\.s?css$/i,
	/components\/[^/]+\.s?css$/i,
];

/**
 * Checks if a filepath represents a component file.
 * @param {string} filePath - File path to check
 * @param {RegExp[]} [patterns=defaultComponentPatterns] - Array of regex patterns
 * @returns {boolean} True if filepath matches any component pattern
 */
export const isComponentFile = (
	filePath,
	patterns = defaultComponentPatterns,
) => {
	return patterns.some((pattern) => pattern.test(filePath));
};

/**
 * Checks if a filepath represents a partial file (starts with underscore).
 * @param {string} filePath - File path to check
 * @returns {boolean} True if file is a partial
 */
export const isPartialFile = (filePath) => {
	return path.basename(filePath).startsWith("_");
};

/**
 * @typedef {Object} WalkOptions
 * @property {string[]} [extensions=['.scss', '.css']] - File extensions to include
 * @property {string[]} [ignore=['node_modules', 'dist', 'build', '.git', 'compiled']] - Directory names to ignore
 * @property {string[]} [excludePatterns=[]] - Glob patterns to exclude
 * @property {boolean} [includePartials=true] - Whether to include partial files
 */

/**
 * Recursively walks a directory and returns matching files.
 * @param {string} baseDirectory - Base directory to start walking from
 * @param {WalkOptions} [options={}] - Walk options
 * @returns {string[]} Array of matching file paths
 */
export const walkDirectory = (baseDirectory, options = {}) => {
	const {
		extensions = [".scss", ".css"],
		ignore = ["node_modules", "dist", "build", ".git", "compiled"],
		excludePatterns = [],
		includePartials = true,
	} = options;

	/** @type {string[]} */
	const matchedFiles = [];

	/**
	 * Recursively traverses a directory.
	 * @param {string} currentDirectory - Directory to traverse
	 */
	function traverseDirectory(currentDirectory) {
		/** @type {string[]} */
		let directoryEntries;
		try {
			directoryEntries = fs.readdirSync(currentDirectory);
		} catch {
			return;
		}

		for (const entry of directoryEntries) {
			const fullPath = path.join(currentDirectory, entry);
			/** @type {fs.Stats} */
			let fileStats;
			try {
				fileStats = fs.statSync(fullPath);
			} catch {
				continue;
			}

			if (fileStats.isDirectory()) {
				if (!ignore.includes(entry) && !matchesExcludePattern(fullPath, excludePatterns)) {
					traverseDirectory(fullPath);
				}
			} else if (extensions.some((extension) => entry.endsWith(extension))) {
				if (!matchesExcludePattern(fullPath, excludePatterns)) {
					if (includePartials || !isPartialFile(fullPath)) {
						matchedFiles.push(fullPath);
					}
				}
			}
		}
	}

	traverseDirectory(path.resolve(baseDirectory));
	return matchedFiles;
};

/**
 * Extracts and formats a component name from a filepath.
 * @param {string} filePath - File path to extract component name from
 * @returns {string} PascalCase component name
 */
export const getComponentName = (filePath) => {
	const baseName = path
		.basename(filePath)
		.replace(/\.s?css$/, "")
		.replace(/\.component$/, "")
		.replace(/\.module$/, "")
		.replace(/\.styles$/, "");

	return baseName
		.split(/[-_]/)
		.map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
		.join("");
};

/**
 * Generates a unique component name from a relative file path.
 * Uses the category folder, component name, and subcomponent hierarchy.
 * Example: "forms/Dropdown/components/Placeholder/styles.module.scss" → "FormsDropdownPlaceholder"
 * @param {string} relativePath - Relative path to the component file
 * @returns {string} Unique PascalCase component name
 */
export const getUniqueComponentName = (relativePath) => {
	const parts = relativePath.split(path.sep);
	const significantParts = [];

	for (let i = 0; i < parts.length; i++) {
		const part = parts[i];
		const prevPart = i > 0 ? parts[i - 1] : null;
		const nextPart = i < parts.length - 1 ? parts[i + 1] : null;

		// Handle "components" and "shared" folders
		if (part === "components" || part === "shared") {
			/* Include if the next part is directly a file (not another folder with specific name)
			   This handles cases like "Menu/components/styles.module.scss" where we want "MenuComponents" */
			if (
				nextPart &&
				(nextPart.endsWith(".scss") || nextPart.endsWith(".css"))
			) {
				significantParts.push(part);
			}
			// Otherwise skip it to avoid "FormsDropdownComponentsPlaceholder"
			continue;
		}

		// For file names, check if they have a meaningful name (not "styles")
		if (part.endsWith(".scss") || part.endsWith(".css")) {
			const baseName = part
				.replace(/\.s?css$/, "")
				.replace(/\.component$/, "")
				.replace(/\.module$/, "")
				.replace(/\.styles$/, "");

			// Only add if meaningful and not duplicate of parent folder
			if (baseName && baseName.toLowerCase() !== "styles") {
				// Avoid duplication: skip if filename matches parent folder name (case-insensitive)
				if (!prevPart || baseName.toLowerCase() !== prevPart.toLowerCase()) {
					significantParts.push(baseName);
				}
			}
			continue;
		}

		significantParts.push(part);
	}

	// Convert each part to PascalCase and join
	return significantParts
		.map((part) =>
			part
				.split(/[-_]/)
				.map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
				.join(""),
		)
		.join("");
};

/**
 * Ensures a directory exists, creating it if necessary.
 * @param {string} dirPath - Directory path to ensure exists
 */
export const ensureDirectory = (dirPath) => {
	if (!fs.existsSync(dirPath)) {
		fs.mkdirSync(dirPath, { recursive: true });
	}
};

/**
 * Gets file modification time.
 * @param {string} filePath - Path to file
 * @returns {number|null} Modification time in ms, or null if file doesn't exist
 */
export const getFileModTime = (filePath) => {
	try {
		return fs.statSync(filePath).mtimeMs;
	} catch {
		return null;
	}
};
