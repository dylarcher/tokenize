/**
 * Flattens CSS by removing CSS custom properties and var() functions.
 * @param {string} cssString - CSS string to flatten
 * @returns {string} Flattened CSS string
 */
export const flattenCssCustomProperties = (cssString) => {
	let result = cssString;
	result = result.replace(/:root\s*\{[^}]*--[^}]*\}/g, "");
	result = result.replace(/var\(\s*--[\w-]+\s*,\s*([^)]+)\)/g, "$1");
	result = result.replace(/var\(\s*--[\w-]+\s*\)/g, "inherit");
	result = result.replace(/[^{}]+\{\s*\}/g, "");
	result = result.replace(/\n\s*\n/g, "\n\n").trim();
	return result;
};

/**
 * Cleans a CSS value by removing !important declarations.
 * @param {string} cssValue - CSS value to clean
 * @returns {string} Cleaned CSS value
 */
export const cleanCssValue = (cssValue) => {
	return cssValue.replace(/!important/gi, "").trim();
};

/**
 * Extracts CSS custom property declarations from a string.
 * @param {string} cssString - CSS string to parse
 * @returns {Map<string, string>} Map of property names to values
 */
export const extractCustomProperties = (cssString) => {
	const properties = new Map();
	const regex = /--([\w-]+)\s*:\s*([^;]+);/g;
	let match;

	for (match = regex.exec(cssString); match !== null; match = regex.exec(cssString)) {
		properties.set(`--${match[1]}`, match[2].trim());
	}

	return properties;
};

/**
 * Resolves var() references in a CSS value.
 * @param {string} value - CSS value potentially containing var()
 * @param {Map<string, string>} properties - Map of available custom properties
 * @param {Set<string>} [visited=new Set()] - Set of visited properties to detect cycles
 * @returns {string} Resolved value
 */
export const resolveVarReferences = (value, properties, visited = new Set()) => {
	const varRegex = /var\(\s*(--[\w-]+)(?:\s*,\s*([^)]+))?\)/g;

	return value.replace(varRegex, (match, propName, fallback) => {
		if (visited.has(propName)) {
			return fallback || match;
		}

		visited.add(propName);
		const propValue = properties.get(propName);

		if (propValue) {
			return resolveVarReferences(propValue, properties, visited);
		}

		return fallback || match;
	});
};

/**
 * Parses a CSS color value and returns its type.
 * @param {string} value - CSS color value
 * @returns {'hex' | 'rgb' | 'hsl' | 'named' | 'unknown'} Color type
 */
export const getColorType = (value) => {
	if (/^#[0-9a-fA-F]{3,8}$/.test(value)) return "hex";
	if (/^rgba?\(/i.test(value)) return "rgb";
	if (/^hsla?\(/i.test(value)) return "hsl";
	if (/^[a-z]+$/i.test(value)) return "named";
	return "unknown";
};
