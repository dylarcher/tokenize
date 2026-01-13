/**
 * DTCG (Design Token Community Group) format utilities.
 * Provides helpers for generating tokens in DTCG-compliant format.
 * @see https://design-tokens.github.io/community-group/format/
 */

/**
 * DTCG token types as defined by the specification.
 * @typedef {'color' | 'dimension' | 'fontFamily' | 'fontWeight' | 'duration' | 'cubicBezier' | 'number' | 'strokeStyle' | 'border' | 'transition' | 'shadow' | 'gradient' | 'typography' | 'fontStyle'} DTCGType
 */

/**
 * @typedef {Object} DTCGToken
 * @property {unknown} $value - Token value
 * @property {DTCGType} $type - Token type
 * @property {string} [$description] - Optional description
 * @property {Record<string, unknown>} [$extensions] - Optional extensions
 */

/**
 * @typedef {Object} LegacyToken
 * @property {unknown} value - Token value
 * @property {string} type - Token type
 * @property {string} [description] - Optional description
 */

/**
 * Creates a DTCG-formatted token.
 * @param {unknown} value - Token value
 * @param {DTCGType} type - Token type
 * @param {string} [description] - Optional description
 * @returns {DTCGToken}
 */
export const createDTCGToken = (value, type, description) => {
	/** @type {DTCGToken} */
	const token = {
		$value: value,
		$type: type,
	};
	if (description) {
		token.$description = description;
	}
	return token;
};

/**
 * Creates a legacy-formatted token (for backwards compatibility).
 * @param {unknown} value - Token value
 * @param {string} type - Token type
 * @param {string} [description] - Optional description
 * @returns {LegacyToken}
 */
export const createLegacyToken = (value, type, description) => {
	/** @type {LegacyToken} */
	const token = {
		value,
		type,
	};
	if (description) {
		token.description = description;
	}
	return token;
};

/**
 * Creates a token in the appropriate format based on config.
 * @param {unknown} value - Token value
 * @param {DTCGType} type - Token type
 * @param {boolean} [useDtcg=true] - Whether to use DTCG format
 * @param {string} [description] - Optional description
 * @returns {DTCGToken | LegacyToken}
 */
export const createToken = (value, type, useDtcg = true, description) => {
	return useDtcg
		? createDTCGToken(value, type, description)
		: createLegacyToken(value, type, description);
};

/**
 * Creates a token reference in DTCG format.
 * @param {string} path - Token path (e.g., "color.primary.500")
 * @returns {string}
 */
export const createReference = (path) => `{${path}}`;

/**
 * Infers DTCG type from a CSS value.
 * @param {string} value - CSS value
 * @returns {DTCGType}
 */
export const inferDTCGType = (value) => {
	if (typeof value !== "string") return "number";

	// Color patterns
	if (
		value.startsWith("#") ||
		value.startsWith("rgb") ||
		value.startsWith("hsl")
	) {
		return "color";
	}

	// Dimension patterns (px, rem, em, %, etc.)
	if (/^-?[\d.]+(?:px|rem|em|%|vh|vw|vmin|vmax|ch|ex)$/.test(value)) {
		return "dimension";
	}

	// Duration patterns
	if (/^[\d.]+(?:ms|s)$/.test(value)) {
		return "duration";
	}

	// Font weight patterns
	if (/^(?:normal|bold|lighter|bolder|\d{3})$/.test(value)) {
		return "fontWeight";
	}

	// Font family (contains commas or quotes)
	if (value.includes(",") || value.includes("'") || value.includes('"')) {
		return "fontFamily";
	}

	// Number patterns
	if (/^-?[\d.]+$/.test(value)) {
		return "number";
	}

	// Default to string value treated as a dimension
	return "dimension";
};

/**
 * Converts a primitive value object to DTCG-formatted tokens.
 * @param {Record<string, unknown>} obj - Object containing primitive values
 * @param {DTCGType} type - Token type for all values
 * @param {boolean} [useDtcg=true] - Whether to use DTCG format
 * @returns {Record<string, DTCGToken | LegacyToken>}
 */
export const convertToDTCGTokens = (obj, type, useDtcg = true) => {
	/** @type {Record<string, DTCGToken | LegacyToken>} */
	const result = {};

	for (const [key, value] of Object.entries(obj)) {
		if (
			typeof value === "object" &&
			value !== null &&
			!("$value" in value) &&
			!("value" in value)
		) {
			// Nested object - recurse
			result[key] = convertToDTCGTokens(
				/** @type {Record<string, unknown>} */ (value),
				type,
				useDtcg,
			);
		} else if (typeof value === "string" || typeof value === "number") {
			// Leaf value - create token
			result[key] = createToken(value, type, useDtcg);
		} else {
			// Already a token or unknown format - pass through
			result[key] = /** @type {any} */ (value);
		}
	}

	return result;
};

/**
 * Wraps a value in a DTCG token format.
 * @template T
 * @param {T} value - Value to wrap
 * @param {DTCGType} type - Token type
 * @param {boolean} useDtcg - Whether to use DTCG format
 * @returns {DTCGToken | LegacyToken | T}
 */
export const wrapToken = (value, type, useDtcg) => {
	if (typeof value === "object" && value !== null) {
		if ("$value" in value || "value" in value) {
			// Already a token
			return value;
		}
		// Object with nested values
		return /** @type {any} */ (
			convertToDTCGTokens(
				/** @type {Record<string, unknown>} */ (value),
				type,
				useDtcg,
			)
		);
	}
	return createToken(value, type, useDtcg);
};

/**
 * Builds a full DTCG token file structure with metadata.
 * @param {Record<string, unknown>} tokens - Token definitions
 * @param {Object} [metadata] - Optional metadata
 * @param {string} [metadata.name] - Token set name
 * @param {string} [metadata.version] - Version string
 * @returns {Record<string, unknown>}
 */
export const buildDTCGFile = (tokens, metadata = {}) => {
	return {
		$schema: "https://design-tokens.org/schema.json",
		...(metadata.name && { $name: metadata.name }),
		...(metadata.version && { $version: metadata.version }),
		...tokens,
	};
};
