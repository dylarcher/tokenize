/**
 * @typedef {Object} HslColor
 * @property {number} hue - Hue (0-360)
 * @property {number} saturation - Saturation (0-100)
 * @property {number} lightness - Lightness (0-100)
 */

/**
 * Converts a hex color string to HSL values.
 * @param {string} hexColor - Hex color string (with or without #)
 * @returns {HslColor} HSL color object
 */
export const convertHexColorToHsl = (hexColor) => {
	hexColor = hexColor.replace(/[#;\s]*/g, "");
	if ((hexColor.length - 3) >>> 0 < 3) {
		hexColor = hexColor.replace(/./g, "$&$&");
	}

	/** @type {number} */
	const redChannel = parseInt(hexColor.slice(0, 2), 16) / 255;

	/** @type {number} */
	const greenChannel = parseInt(hexColor.slice(2, 4), 16) / 255;

	/** @type {number} */
	const blueChannel = parseInt(hexColor.slice(4, 6), 16) / 255;

	/** @type {number} */
	const maximumChannel = Math.max(redChannel, greenChannel, blueChannel);

	/** @type {number} */
	const minimumChannel = Math.min(redChannel, greenChannel, blueChannel);

	/** @type {number} */
	const lightness = (maximumChannel + minimumChannel) / 2;

	/** @type {number} */
	let hue = 0;

	/** @type {number} */
	let saturation = 1;

	if (maximumChannel === minimumChannel) {
		hue = saturation = 0;
	} else {
		const channelDelta = maximumChannel - minimumChannel;
		saturation =
			lightness > 0.5
				? channelDelta / (2 - maximumChannel - minimumChannel)
				: channelDelta / (maximumChannel + minimumChannel);
		switch (maximumChannel) {
			case redChannel:
				hue =
					((greenChannel - blueChannel) / channelDelta +
						(greenChannel < blueChannel ? 6 : 0)) /
					6;
				break;
			case greenChannel:
				hue = ((blueChannel - redChannel) / channelDelta + 2) / 6;
				break;
			case blueChannel:
				hue = ((redChannel - greenChannel) / channelDelta + 4) / 6;
				break;
		}
	}

	return {
		hue: Math.round(hue * 360),
		saturation: Math.round(saturation * 100),
		lightness: Math.round(lightness * 100),
	};
};

/**
 * @typedef {'red' | 'orange' | 'yellow' | 'green' | 'cyan' | 'blue' | 'purple' | 'pink'} HueCategory
 */

/**
 * Gets the color category based on hue value.
 * @param {number} hueValue - Hue value (0-360)
 * @returns {HueCategory} Color category name
 */
export const getHueCategoryFromValue = (hueValue) => {
	if (hueValue < 15 || hueValue >= 345) return "red";
	if (hueValue < 45) return "orange";
	if (hueValue < 75) return "yellow";
	if (hueValue < 165) return "green";
	if (hueValue < 195) return "cyan";
	if (hueValue < 255) return "blue";
	if (hueValue < 285) return "purple";
	if (hueValue < 345) return "pink";
	return "red";
};

/**
 * Categorizes a hex color into a named color category.
 * @param {string} hexColor - Hex color string
 * @returns {HueCategory | 'neutral'} Color category name
 */
export const categorizeHexColor = (hexColor) => {
	const { hue, saturation } = convertHexColorToHsl(hexColor);
	if (saturation < 10) return "neutral";
	return getHueCategoryFromValue(hue);
};

/**
 * Normalizes a color string to lowercase 6-digit hex format.
 * @param {string} colorString - Color string to normalize
 * @returns {string} Normalized color string
 */
export const normalizeColorToHex = (colorString) => {
	colorString = colorString.toLowerCase().trim();
	if (/^#[0-9a-f]{3}$/i.test(colorString)) {
		colorString = `#${colorString[1]}${colorString[1]}${colorString[2]}${colorString[2]}${colorString[3]}${colorString[3]}`;
	}
	return colorString;
};

/**
 * Converts HSL values to hex color string.
 * @param {number} h - Hue (0-360)
 * @param {number} s - Saturation (0-100)
 * @param {number} l - Lightness (0-100)
 * @returns {string} Hex color string
 */
export const convertHslToHex = (h, s, l) => {
	s /= 100;
	l /= 100;

	const c = (1 - Math.abs(2 * l - 1)) * s;
	const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
	const m = l - c / 2;

	let r = 0;
	let g = 0;
	let b = 0;

	if (h < 60) {
		r = c;
		g = x;
	} else if (h < 120) {
		r = x;
		g = c;
	} else if (h < 180) {
		g = c;
		b = x;
	} else if (h < 240) {
		g = x;
		b = c;
	} else if (h < 300) {
		r = x;
		b = c;
	} else {
		r = c;
		b = x;
	}

	const toHex = (n) => {
		const hex = Math.round((n + m) * 255).toString(16);
		return hex.length === 1 ? `0${hex}` : hex;
	};

	return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
};

/**
 * Calculates relative luminance for WCAG contrast calculations.
 * @param {string} hexColor - Hex color string
 * @returns {number} Relative luminance (0-1)
 */
export const getRelativeLuminance = (hexColor) => {
	hexColor = hexColor.replace("#", "");
	if (hexColor.length === 3) {
		hexColor = hexColor
			.split("")
			.map((c) => c + c)
			.join("");
	}

	const r = parseInt(hexColor.slice(0, 2), 16) / 255;
	const g = parseInt(hexColor.slice(2, 4), 16) / 255;
	const b = parseInt(hexColor.slice(4, 6), 16) / 255;

	const toLinear = (c) =>
		c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;

	return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
};

/**
 * Calculates WCAG contrast ratio between two colors.
 * @param {string} color1 - First hex color
 * @param {string} color2 - Second hex color
 * @returns {number} Contrast ratio (1-21)
 */
export const getContrastRatio = (color1, color2) => {
	const l1 = getRelativeLuminance(color1);
	const l2 = getRelativeLuminance(color2);
	const lighter = Math.max(l1, l2);
	const darker = Math.min(l1, l2);
	return (lighter + 0.05) / (darker + 0.05);
};
