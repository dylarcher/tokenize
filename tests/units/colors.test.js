import { describe, test, expect } from "bun:test";
import {
	convertHexColorToHsl,
	getHueCategoryFromValue,
	categorizeHexColor,
	normalizeColorToHex,
	convertHslToHex,
	getRelativeLuminance,
	getContrastRatio,
} from "../../src/helperUtils/colors.js";

describe("colors", () => {
	describe("convertHexColorToHsl", () => {
		test("converts pure white to HSL", () => {
			const result = convertHexColorToHsl("#ffffff");
			expect(result.hue).toBe(0);
			expect(result.saturation).toBe(0);
			expect(result.lightness).toBe(100);
		});

		test("converts pure black to HSL", () => {
			const result = convertHexColorToHsl("#000000");
			expect(result.hue).toBe(0);
			expect(result.saturation).toBe(0);
			expect(result.lightness).toBe(0);
		});

		test("converts pure red to HSL", () => {
			const result = convertHexColorToHsl("#ff0000");
			expect(result.hue).toBe(0);
			expect(result.saturation).toBe(100);
			expect(result.lightness).toBe(50);
		});

		test("converts pure green to HSL", () => {
			const result = convertHexColorToHsl("#00ff00");
			expect(result.hue).toBe(120);
			expect(result.saturation).toBe(100);
			expect(result.lightness).toBe(50);
		});

		test("converts pure blue to HSL", () => {
			const result = convertHexColorToHsl("#0000ff");
			expect(result.hue).toBe(240);
			expect(result.saturation).toBe(100);
			expect(result.lightness).toBe(50);
		});

		test("converts 3-digit hex to HSL", () => {
			const result = convertHexColorToHsl("#f00");
			expect(result.hue).toBe(0);
			expect(result.saturation).toBe(100);
			expect(result.lightness).toBe(50);
		});

		test("handles hex without hash", () => {
			const result = convertHexColorToHsl("ff0000");
			expect(result.hue).toBe(0);
			expect(result.saturation).toBe(100);
			expect(result.lightness).toBe(50);
		});

		test("handles hex with extra characters", () => {
			const result = convertHexColorToHsl("#ff0000;");
			expect(result.hue).toBe(0);
		});

		test("converts cyan to HSL", () => {
			const result = convertHexColorToHsl("#00ffff");
			expect(result.hue).toBe(180);
			expect(result.saturation).toBe(100);
			expect(result.lightness).toBe(50);
		});

		test("converts magenta to HSL", () => {
			const result = convertHexColorToHsl("#ff00ff");
			expect(result.hue).toBe(300);
			expect(result.saturation).toBe(100);
			expect(result.lightness).toBe(50);
		});

		test("converts yellow to HSL", () => {
			const result = convertHexColorToHsl("#ffff00");
			expect(result.hue).toBe(60);
			expect(result.saturation).toBe(100);
			expect(result.lightness).toBe(50);
		});

		test("converts mid-gray to HSL", () => {
			const result = convertHexColorToHsl("#808080");
			expect(result.hue).toBe(0);
			expect(result.saturation).toBe(0);
			expect(result.lightness).toBe(50);
		});

		test("converts complex color to HSL", () => {
			const result = convertHexColorToHsl("#3b82f6");
			expect(result.hue).toBeGreaterThan(200);
			expect(result.hue).toBeLessThan(230);
			expect(result.saturation).toBeGreaterThan(80);
		});

		test("handles dark colors with low lightness", () => {
			const result = convertHexColorToHsl("#1a1a1a");
			expect(result.lightness).toBeLessThan(20);
		});

		test("handles light colors with high lightness", () => {
			const result = convertHexColorToHsl("#f5f5f5");
			expect(result.lightness).toBeGreaterThan(90);
		});
	});

	describe("getHueCategoryFromValue", () => {
		test("returns red for hue 0", () => {
			expect(getHueCategoryFromValue(0)).toBe("red");
		});

		test("returns red for hue 10", () => {
			expect(getHueCategoryFromValue(10)).toBe("red");
		});

		test("returns orange for hue 30", () => {
			expect(getHueCategoryFromValue(30)).toBe("orange");
		});

		test("returns yellow for hue 60", () => {
			expect(getHueCategoryFromValue(60)).toBe("yellow");
		});

		test("returns green for hue 120", () => {
			expect(getHueCategoryFromValue(120)).toBe("green");
		});

		test("returns cyan for hue 180", () => {
			expect(getHueCategoryFromValue(180)).toBe("cyan");
		});

		test("returns blue for hue 220", () => {
			expect(getHueCategoryFromValue(220)).toBe("blue");
		});

		test("returns purple for hue 270", () => {
			expect(getHueCategoryFromValue(270)).toBe("purple");
		});

		test("returns pink for hue 320", () => {
			expect(getHueCategoryFromValue(320)).toBe("pink");
		});

		test("returns red for hue 350", () => {
			expect(getHueCategoryFromValue(350)).toBe("red");
		});

		test("returns red for hue 360", () => {
			expect(getHueCategoryFromValue(360)).toBe("red");
		});

		test("handles boundary at 15 (orange)", () => {
			expect(getHueCategoryFromValue(15)).toBe("orange");
		});

		test("handles boundary at 45 (yellow)", () => {
			expect(getHueCategoryFromValue(45)).toBe("yellow");
		});

		test("handles boundary at 75 (green)", () => {
			expect(getHueCategoryFromValue(75)).toBe("green");
		});

		test("handles boundary at 165 (cyan)", () => {
			expect(getHueCategoryFromValue(165)).toBe("cyan");
		});

		test("handles boundary at 195 (blue)", () => {
			expect(getHueCategoryFromValue(195)).toBe("blue");
		});

		test("handles boundary at 255 (purple)", () => {
			expect(getHueCategoryFromValue(255)).toBe("purple");
		});

		test("handles boundary at 285 (pink)", () => {
			expect(getHueCategoryFromValue(285)).toBe("pink");
		});

		test("handles boundary at 345 (red)", () => {
			expect(getHueCategoryFromValue(345)).toBe("red");
		});
	});

	describe("categorizeHexColor", () => {
		test("categorizes red color", () => {
			expect(categorizeHexColor("#ff0000")).toBe("red");
		});

		test("categorizes blue color", () => {
			expect(categorizeHexColor("#0000ff")).toBe("blue");
		});

		test("categorizes green color", () => {
			expect(categorizeHexColor("#00ff00")).toBe("green");
		});

		test("categorizes orange color", () => {
			expect(categorizeHexColor("#ff8000")).toBe("orange");
		});

		test("categorizes low saturation as neutral", () => {
			expect(categorizeHexColor("#808080")).toBe("neutral");
		});

		test("categorizes white as neutral", () => {
			expect(categorizeHexColor("#ffffff")).toBe("neutral");
		});

		test("categorizes black as neutral", () => {
			expect(categorizeHexColor("#000000")).toBe("neutral");
		});

		test("categorizes very light gray as neutral", () => {
			expect(categorizeHexColor("#f5f5f5")).toBe("neutral");
		});

		test("categorizes cyan color", () => {
			expect(categorizeHexColor("#00ffff")).toBe("cyan");
		});

		test("categorizes purple color", () => {
			expect(categorizeHexColor("#9900ff")).toBe("purple");
		});

		test("categorizes pink color", () => {
			expect(categorizeHexColor("#ff66cc")).toBe("pink");
		});

		test("categorizes yellow color", () => {
			expect(categorizeHexColor("#ffff00")).toBe("yellow");
		});
	});

	describe("normalizeColorToHex", () => {
		test("expands 3-digit hex to 6-digit", () => {
			expect(normalizeColorToHex("#abc")).toBe("#aabbcc");
		});

		test("expands uppercase 3-digit hex", () => {
			expect(normalizeColorToHex("#ABC")).toBe("#aabbcc");
		});

		test("keeps 6-digit hex unchanged", () => {
			expect(normalizeColorToHex("#aabbcc")).toBe("#aabbcc");
		});

		test("lowercases 6-digit hex", () => {
			expect(normalizeColorToHex("#AABBCC")).toBe("#aabbcc");
		});

		test("trims whitespace", () => {
			expect(normalizeColorToHex("  #abc  ")).toBe("#aabbcc");
		});

		test("normalizes #f00 to #ff0000", () => {
			expect(normalizeColorToHex("#f00")).toBe("#ff0000");
		});

		test("normalizes #fff to #ffffff", () => {
			expect(normalizeColorToHex("#fff")).toBe("#ffffff");
		});

		test("normalizes #000 to #000000", () => {
			expect(normalizeColorToHex("#000")).toBe("#000000");
		});
	});

	describe("convertHslToHex", () => {
		test("converts red HSL to hex", () => {
			expect(convertHslToHex(0, 100, 50)).toBe("#ff0000");
		});

		test("converts green HSL to hex", () => {
			expect(convertHslToHex(120, 100, 50)).toBe("#00ff00");
		});

		test("converts blue HSL to hex", () => {
			expect(convertHslToHex(240, 100, 50)).toBe("#0000ff");
		});

		test("converts cyan HSL to hex", () => {
			expect(convertHslToHex(180, 100, 50)).toBe("#00ffff");
		});

		test("converts magenta HSL to hex", () => {
			expect(convertHslToHex(300, 100, 50)).toBe("#ff00ff");
		});

		test("converts yellow HSL to hex", () => {
			expect(convertHslToHex(60, 100, 50)).toBe("#ffff00");
		});

		test("converts white HSL to hex", () => {
			expect(convertHslToHex(0, 0, 100)).toBe("#ffffff");
		});

		test("converts black HSL to hex", () => {
			expect(convertHslToHex(0, 0, 0)).toBe("#000000");
		});

		test("converts gray HSL to hex", () => {
			const result = convertHslToHex(0, 0, 50);
			expect(result).toBe("#808080");
		});

		test("converts orange HSL to hex", () => {
			const result = convertHslToHex(30, 100, 50);
			expect(result).toBe("#ff8000");
		});

		test("handles hue in 60-120 range", () => {
			const result = convertHslToHex(90, 100, 50);
			expect(result).toMatch(/^#[0-9a-f]{6}$/);
		});

		test("handles hue in 120-180 range", () => {
			const result = convertHslToHex(150, 100, 50);
			expect(result).toMatch(/^#[0-9a-f]{6}$/);
		});

		test("handles hue in 180-240 range", () => {
			const result = convertHslToHex(210, 100, 50);
			expect(result).toMatch(/^#[0-9a-f]{6}$/);
		});

		test("handles hue in 240-300 range", () => {
			const result = convertHslToHex(270, 100, 50);
			expect(result).toMatch(/^#[0-9a-f]{6}$/);
		});

		test("handles hue >= 300", () => {
			const result = convertHslToHex(330, 100, 50);
			expect(result).toMatch(/^#[0-9a-f]{6}$/);
		});

		test("handles low saturation", () => {
			const result = convertHslToHex(180, 10, 50);
			expect(result).toMatch(/^#[0-9a-f]{6}$/);
		});

		test("handles high lightness", () => {
			const result = convertHslToHex(180, 50, 90);
			expect(result).toMatch(/^#[0-9a-f]{6}$/);
		});
	});

	describe("getRelativeLuminance", () => {
		test("returns 1 for white", () => {
			expect(getRelativeLuminance("#ffffff")).toBeCloseTo(1, 2);
		});

		test("returns 0 for black", () => {
			expect(getRelativeLuminance("#000000")).toBeCloseTo(0, 2);
		});

		test("returns approximately 0.2126 for pure red", () => {
			expect(getRelativeLuminance("#ff0000")).toBeCloseTo(0.2126, 2);
		});

		test("returns approximately 0.7152 for pure green", () => {
			expect(getRelativeLuminance("#00ff00")).toBeCloseTo(0.7152, 2);
		});

		test("returns approximately 0.0722 for pure blue", () => {
			expect(getRelativeLuminance("#0000ff")).toBeCloseTo(0.0722, 2);
		});

		test("handles 3-digit hex", () => {
			expect(getRelativeLuminance("#fff")).toBeCloseTo(1, 2);
		});

		test("handles hex without hash", () => {
			expect(getRelativeLuminance("ffffff")).toBeCloseTo(1, 2);
		});

		test("calculates mid-gray luminance", () => {
			const luminance = getRelativeLuminance("#808080");
			expect(luminance).toBeGreaterThan(0.2);
			expect(luminance).toBeLessThan(0.3);
		});

		test("handles dark colors correctly", () => {
			const luminance = getRelativeLuminance("#1a1a1a");
			expect(luminance).toBeLessThan(0.02);
		});

		test("handles light colors correctly", () => {
			const luminance = getRelativeLuminance("#f0f0f0");
			expect(luminance).toBeGreaterThan(0.85);
		});
	});

	describe("getContrastRatio", () => {
		test("returns 21 for black and white", () => {
			expect(getContrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 0);
		});

		test("returns 21 for white and black", () => {
			expect(getContrastRatio("#ffffff", "#000000")).toBeCloseTo(21, 0);
		});

		test("returns 1 for same colors", () => {
			expect(getContrastRatio("#ff0000", "#ff0000")).toBeCloseTo(1, 2);
		});

		test("meets WCAG AA threshold for black on white", () => {
			const ratio = getContrastRatio("#000000", "#ffffff");
			expect(ratio).toBeGreaterThanOrEqual(4.5);
		});

		test("meets WCAG AAA threshold for black on white", () => {
			const ratio = getContrastRatio("#000000", "#ffffff");
			expect(ratio).toBeGreaterThanOrEqual(7);
		});

		test("calculates ratio for red on white", () => {
			const ratio = getContrastRatio("#ff0000", "#ffffff");
			expect(ratio).toBeGreaterThan(3);
			expect(ratio).toBeLessThan(5);
		});

		test("calculates ratio for blue on white", () => {
			const ratio = getContrastRatio("#0000ff", "#ffffff");
			expect(ratio).toBeGreaterThan(7);
			expect(ratio).toBeLessThan(9);
		});

		test("calculates ratio for green on black", () => {
			const ratio = getContrastRatio("#00ff00", "#000000");
			expect(ratio).toBeGreaterThan(10);
		});

		test("handles similar colors with low contrast", () => {
			const ratio = getContrastRatio("#e0e0e0", "#f0f0f0");
			expect(ratio).toBeLessThan(2);
		});
	});
});
