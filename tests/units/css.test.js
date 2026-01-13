import { describe, test, expect } from "bun:test";
import {
	flattenCssCustomProperties,
	cleanCssValue,
	extractCustomProperties,
	resolveVarReferences,
	getColorType,
} from "../../src/helperUtils/css.js";

describe("css", () => {
	describe("flattenCssCustomProperties", () => {
		test("removes :root block with custom properties", () => {
			const css = `:root { --color-primary: blue; --color-secondary: red; }
.button { color: red; }`;
			const result = flattenCssCustomProperties(css);
			expect(result).not.toContain(":root");
			expect(result).not.toContain("--color-primary");
			expect(result).toContain(".button");
		});

		test("replaces var() with fallback value", () => {
			const css = ".button { color: var(--color-primary, blue); }";
			const result = flattenCssCustomProperties(css);
			expect(result).toContain("blue");
			expect(result).not.toContain("var(");
		});

		test("replaces var() without fallback with inherit", () => {
			const css = ".button { color: var(--color-primary); }";
			const result = flattenCssCustomProperties(css);
			expect(result).toContain("inherit");
			expect(result).not.toContain("var(");
		});

		test("removes empty rule blocks", () => {
			const css = ".empty {} .filled { color: red; }";
			const result = flattenCssCustomProperties(css);
			expect(result).not.toContain(".empty {}");
			expect(result).toContain(".filled");
		});

		test("reduces multiple empty lines", () => {
			const css = ".a { color: red; }\n\n\n\n.b { color: blue; }";
			const result = flattenCssCustomProperties(css);
			expect(result).not.toContain("\n\n\n");
		});

		test("handles multiple :root blocks", () => {
			const css = `:root { --a: 1; }
:root { --b: 2; }
.test { color: red; }`;
			const result = flattenCssCustomProperties(css);
			expect(result).not.toContain(":root");
			expect(result).toContain(".test");
		});

		test("handles complex fallback values", () => {
			const css = ".btn { margin: var(--spacing, 10px 20px); }";
			const result = flattenCssCustomProperties(css);
			expect(result).toContain("10px 20px");
		});

		test("preserves non-var CSS", () => {
			const css = ".button { color: red; background: blue; }";
			const result = flattenCssCustomProperties(css);
			expect(result).toContain("color: red");
			expect(result).toContain("background: blue");
		});
	});

	describe("cleanCssValue", () => {
		test("removes !important declaration", () => {
			expect(cleanCssValue("red !important")).toBe("red");
		});

		test("removes !IMPORTANT (case insensitive)", () => {
			expect(cleanCssValue("blue !IMPORTANT")).toBe("blue");
		});

		test("trims whitespace", () => {
			expect(cleanCssValue("  red  ")).toBe("red");
		});

		test("handles value without !important", () => {
			expect(cleanCssValue("10px")).toBe("10px");
		});

		test("handles complex values with !important", () => {
			expect(cleanCssValue("1px solid red !important")).toBe("1px solid red");
		});

		test("handles empty string", () => {
			expect(cleanCssValue("")).toBe("");
		});

		test("handles value with only whitespace", () => {
			expect(cleanCssValue("   ")).toBe("");
		});
	});

	describe("extractCustomProperties", () => {
		test("extracts single custom property", () => {
			const css = ":root { --color-primary: blue; }";
			const props = extractCustomProperties(css);
			expect(props.get("--color-primary")).toBe("blue");
		});

		test("extracts multiple custom properties", () => {
			const css = ":root { --a: 1; --b: 2; --c: 3; }";
			const props = extractCustomProperties(css);
			expect(props.size).toBe(3);
			expect(props.get("--a")).toBe("1");
			expect(props.get("--b")).toBe("2");
			expect(props.get("--c")).toBe("3");
		});

		test("handles hyphenated property names", () => {
			const css = ":root { --color-primary-light: #f0f0f0; }";
			const props = extractCustomProperties(css);
			expect(props.get("--color-primary-light")).toBe("#f0f0f0");
		});

		test("handles complex values", () => {
			const css = ":root { --shadow: 0 2px 4px rgba(0,0,0,0.1); }";
			const props = extractCustomProperties(css);
			expect(props.get("--shadow")).toBe("0 2px 4px rgba(0,0,0,0.1)");
		});

		test("handles var() references in values", () => {
			const css = ":root { --derived: var(--base); }";
			const props = extractCustomProperties(css);
			expect(props.get("--derived")).toBe("var(--base)");
		});

		test("trims whitespace from values", () => {
			const css = ":root { --color:    blue   ; }";
			const props = extractCustomProperties(css);
			expect(props.get("--color")).toBe("blue");
		});

		test("returns empty Map for CSS without custom properties", () => {
			const css = ".button { color: red; }";
			const props = extractCustomProperties(css);
			expect(props.size).toBe(0);
		});

		test("handles properties outside :root", () => {
			const css = ".theme { --color: red; }";
			const props = extractCustomProperties(css);
			expect(props.get("--color")).toBe("red");
		});

		test("handles multiline declarations", () => {
			const css = `
:root {
  --color-a: red;
  --color-b: blue;
}`;
			const props = extractCustomProperties(css);
			expect(props.get("--color-a")).toBe("red");
			expect(props.get("--color-b")).toBe("blue");
		});
	});

	describe("resolveVarReferences", () => {
		const properties = new Map([
			["--color-primary", "blue"],
			["--color-secondary", "var(--color-primary)"],
			["--spacing", "8px"],
			["--circular-a", "var(--circular-b)"],
			["--circular-b", "var(--circular-a)"],
		]);

		test("resolves simple var reference", () => {
			const result = resolveVarReferences("var(--color-primary)", properties);
			expect(result).toBe("blue");
		});

		test("resolves chained var references", () => {
			const result = resolveVarReferences("var(--color-secondary)", properties);
			expect(result).toBe("blue");
		});

		test("uses fallback when property not found", () => {
			const result = resolveVarReferences("var(--unknown, red)", properties);
			expect(result).toBe("red");
		});

		test("returns original when no fallback and not found", () => {
			const result = resolveVarReferences("var(--unknown)", properties);
			expect(result).toBe("var(--unknown)");
		});

		test("handles value with multiple var references", () => {
			const result = resolveVarReferences(
				"var(--color-primary) var(--spacing)",
				properties,
			);
			expect(result).toBe("blue 8px");
		});

		test("handles circular references gracefully", () => {
			const result = resolveVarReferences("var(--circular-a)", properties);
			expect(result).not.toBe(undefined);
		});

		test("handles nested circular with fallback", () => {
			const result = resolveVarReferences("var(--circular-a, fallback)", properties);
			expect(result).toBe("var(--circular-a)");
		});

		test("preserves non-var values", () => {
			const result = resolveVarReferences("10px solid red", properties);
			expect(result).toBe("10px solid red");
		});

		test("handles empty visited set", () => {
			const result = resolveVarReferences("var(--color-primary)", properties, new Set());
			expect(result).toBe("blue");
		});

		test("handles var with leading whitespace", () => {
			const result = resolveVarReferences("var( --color-primary)", properties);
			expect(result).toBe("blue");
		});

		test("handles fallback with leading whitespace", () => {
			const result = resolveVarReferences("var(--unknown, red)", properties);
			expect(result).toBe("red");
		});
	});

	describe("getColorType", () => {
		test("identifies 3-digit hex colors", () => {
			expect(getColorType("#fff")).toBe("hex");
			expect(getColorType("#abc")).toBe("hex");
		});

		test("identifies 6-digit hex colors", () => {
			expect(getColorType("#ffffff")).toBe("hex");
			expect(getColorType("#aabbcc")).toBe("hex");
		});

		test("identifies 8-digit hex colors (with alpha)", () => {
			expect(getColorType("#ffffffff")).toBe("hex");
			expect(getColorType("#aabbccdd")).toBe("hex");
		});

		test("identifies rgb() colors", () => {
			expect(getColorType("rgb(255, 0, 0)")).toBe("rgb");
			expect(getColorType("rgb(0,0,0)")).toBe("rgb");
		});

		test("identifies rgba() colors", () => {
			expect(getColorType("rgba(255, 0, 0, 0.5)")).toBe("rgb");
			expect(getColorType("RGBA(0,0,0,1)")).toBe("rgb");
		});

		test("identifies hsl() colors", () => {
			expect(getColorType("hsl(0, 100%, 50%)")).toBe("hsl");
			expect(getColorType("hsl(120,50%,50%)")).toBe("hsl");
		});

		test("identifies hsla() colors", () => {
			expect(getColorType("hsla(0, 100%, 50%, 0.5)")).toBe("hsl");
			expect(getColorType("HSLA(0,0%,0%,1)")).toBe("hsl");
		});

		test("identifies named colors", () => {
			expect(getColorType("red")).toBe("named");
			expect(getColorType("blue")).toBe("named");
			expect(getColorType("transparent")).toBe("named");
			expect(getColorType("currentColor")).toBe("named");
		});

		test("returns unknown for invalid formats", () => {
			expect(getColorType("not-a-color")).toBe("unknown");
			expect(getColorType("123")).toBe("unknown");
			expect(getColorType("#gg0000")).toBe("unknown");
			expect(getColorType("")).toBe("unknown");
		});

		test("returns unknown for var() references", () => {
			expect(getColorType("var(--color)")).toBe("unknown");
		});

		test("handles uppercase hex", () => {
			expect(getColorType("#FFFFFF")).toBe("hex");
			expect(getColorType("#ABC")).toBe("hex");
		});
	});
});
