import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { OUTPUTS_DIR } from "../helpers/testUtils.js";

const TEST_DIR = join(OUTPUTS_DIR, ".tmp", "primitives-test");
const OUT_DIR = join(TEST_DIR, "dist");

/**
 * Runs the primitives generator.
 * @param {string[]} args - Command arguments
 * @returns {Promise<{stdout: string, stderr: string, code: number}>}
 */
const runPrimitives = (args = []) => {
	return new Promise((resolve) => {
		const proc = spawn("bun", ["src/generators/primitives.js", ...args], {
			cwd: join(import.meta.dir, "../.."),
		});
		let stdout = "";
		let stderr = "";
		proc.stdout.on("data", (data) => {
			stdout += data.toString();
		});
		proc.stderr.on("data", (data) => {
			stderr += data.toString();
		});
		proc.on("close", (code) => {
			resolve({ stdout, stderr, code: code ?? 0 });
		});
	});
};

describe("primitives", () => {
	beforeAll(() => {
		rmSync(TEST_DIR, { recursive: true, force: true });
		mkdirSync(OUT_DIR, { recursive: true });

		const scanBase = {
			colors: [
				"#3b82f6",
				"#60a5fa",
				"#93c5fd",
				"#10b981",
				"#34d399",
				"#6ee7b7",
				"#ef4444",
				"#f87171",
				"#fca5a5",
				"#ffffff",
				"#f5f5f5",
				"#e5e5e5",
				"#a3a3a3",
				"#737373",
				"#525252",
				"#1a1a1a",
				"#000000",
			],
			spacing: ["4px", "8px", "12px", "16px", "24px", "32px", "48px", "64px"],
			fontFamilies: ['"Inter", sans-serif', '"Roboto Mono", monospace'],
			fontSizes: ["12px", "14px", "16px", "18px", "20px", "24px", "32px", "48px"],
			fontWeights: ["400", "500", "600", "700"],
			lineHeights: ["1", "1.25", "1.5", "1.75", "2"],
			letterSpacings: ["-0.02em", "0", "0.05em", "0.1em"],
			borderRadii: ["0", "4px", "8px", "12px", "9999px"],
			borderWidths: ["1px", "2px"],
			shadows: [
				"0 1px 2px rgba(0,0,0,0.05)",
				"0 2px 4px rgba(0,0,0,0.1)",
				"0 4px 8px rgba(0,0,0,0.15)",
				"0 8px 16px rgba(0,0,0,0.2)",
				"0 16px 32px rgba(0,0,0,0.25)",
			],
			zIndices: ["1", "10", "50", "100", "999"],
			variables: {},
			sources: ["test.scss"],
		};

		writeFileSync(join(OUT_DIR, "base.json"), JSON.stringify(scanBase, null, 2));
	});

	afterAll(() => {
		rmSync(TEST_DIR, { recursive: true, force: true });
	});

	describe("color grouping", () => {
		test("groups colors by hue category", async () => {
			await runPrimitives(["-o", OUT_DIR, "-Q"]);

			const primitives = JSON.parse(
				readFileSync(join(OUT_DIR, "primitives.json"), "utf-8"),
			);
			expect(primitives.color).toBeDefined();
			expect(primitives.color.blue).toBeDefined();
			expect(primitives.color.green).toBeDefined();
			expect(primitives.color.red).toBeDefined();
			expect(primitives.color.neutral).toBeDefined();
		});

		test("maps colors to numeric scale (100-950)", async () => {
			await runPrimitives(["-o", OUT_DIR, "-Q"]);

			const primitives = JSON.parse(
				readFileSync(join(OUT_DIR, "primitives.json"), "utf-8"),
			);
			const blueKeys = Object.keys(primitives.color.blue).map(Number);
			expect(blueKeys.every((k) => k >= 100 && k <= 950)).toBe(true);
		});

		test("sorts colors by luminance within groups", async () => {
			await runPrimitives(["-o", OUT_DIR, "-Q"]);

			const primitives = JSON.parse(
				readFileSync(join(OUT_DIR, "primitives.json"), "utf-8"),
			);
			const neutralValues = Object.entries(primitives.color.neutral);
			for (let i = 0; i < neutralValues.length - 1; i++) {
				const [key1] = neutralValues[i];
				const [key2] = neutralValues[i + 1];
				expect(Number(key1)).toBeLessThan(Number(key2));
			}
		});
	});

	describe("spacing scale", () => {
		test("generates spacing scale from pixel values", async () => {
			await runPrimitives(["-o", OUT_DIR, "-Q"]);

			const primitives = JSON.parse(
				readFileSync(join(OUT_DIR, "primitives.json"), "utf-8"),
			);
			expect(primitives.spacing).toBeDefined();
			expect(Object.keys(primitives.spacing).length).toBeGreaterThan(0);
		});

		test("maps values to base-4 steps", async () => {
			await runPrimitives(["-o", OUT_DIR, "-Q"]);

			const primitives = JSON.parse(
				readFileSync(join(OUT_DIR, "primitives.json"), "utf-8"),
			);
			expect(primitives.spacing["1"]).toBe("4px");
			expect(primitives.spacing["2"]).toBe("8px");
			expect(primitives.spacing["4"]).toBe("16px");
		});
	});

	describe("typography scale", () => {
		test("generates font size scale", async () => {
			await runPrimitives(["-o", OUT_DIR, "-Q"]);

			const primitives = JSON.parse(
				readFileSync(join(OUT_DIR, "primitives.json"), "utf-8"),
			);
			expect(primitives.typography.fontSize).toBeDefined();
		});

		test("uses named sizes (xs, sm, base, md, lg, xl, etc.)", async () => {
			await runPrimitives(["-o", OUT_DIR, "-Q"]);

			const primitives = JSON.parse(
				readFileSync(join(OUT_DIR, "primitives.json"), "utf-8"),
			);
			const sizes = Object.keys(primitives.typography.fontSize);
			expect(sizes).toContain("xs");
			expect(sizes).toContain("base");
		});

		test("generates font family tokens", async () => {
			await runPrimitives(["-o", OUT_DIR, "-Q"]);

			const primitives = JSON.parse(
				readFileSync(join(OUT_DIR, "primitives.json"), "utf-8"),
			);
			expect(primitives.typography.fontFamily).toBeDefined();
			expect(primitives.typography.fontFamily.primary).toBeDefined();
		});

		test("generates font weight tokens", async () => {
			await runPrimitives(["-o", OUT_DIR, "-Q"]);

			const primitives = JSON.parse(
				readFileSync(join(OUT_DIR, "primitives.json"), "utf-8"),
			);
			expect(primitives.typography.fontWeight).toBeDefined();
			expect(primitives.typography.fontWeight.normal).toBe("400");
			expect(primitives.typography.fontWeight.bold).toBe("700");
		});

		test("generates line height tokens", async () => {
			await runPrimitives(["-o", OUT_DIR, "-Q"]);

			const primitives = JSON.parse(
				readFileSync(join(OUT_DIR, "primitives.json"), "utf-8"),
			);
			expect(primitives.typography.lineHeight).toBeDefined();
		});

		test("generates letter spacing tokens", async () => {
			await runPrimitives(["-o", OUT_DIR, "-Q"]);

			const primitives = JSON.parse(
				readFileSync(join(OUT_DIR, "primitives.json"), "utf-8"),
			);
			expect(primitives.typography.letterSpacing).toBeDefined();
		});
	});

	describe("border tokens", () => {
		test("generates border radius tokens", async () => {
			await runPrimitives(["-o", OUT_DIR, "-Q"]);

			const primitives = JSON.parse(
				readFileSync(join(OUT_DIR, "primitives.json"), "utf-8"),
			);
			expect(primitives.border.radius).toBeDefined();
		});
	});

	describe("shadow tokens", () => {
		test("generates shadow scale", async () => {
			await runPrimitives(["-o", OUT_DIR, "-Q"]);

			const primitives = JSON.parse(
				readFileSync(join(OUT_DIR, "primitives.json"), "utf-8"),
			);
			expect(primitives.shadow).toBeDefined();
		});
	});

	describe("z-index tokens", () => {
		test("generates z-index scale", async () => {
			await runPrimitives(["-o", OUT_DIR, "-Q"]);

			const primitives = JSON.parse(
				readFileSync(join(OUT_DIR, "primitives.json"), "utf-8"),
			);
			expect(primitives.zIndex).toBeDefined();
		});
	});

	describe("output formats", () => {
		test("generates JSON output", async () => {
			await runPrimitives(["-o", OUT_DIR, "-Q"]);
			expect(existsSync(join(OUT_DIR, "primitives.json"))).toBe(true);
		});

		test("generates SCSS output", async () => {
			await runPrimitives(["-o", OUT_DIR, "-Q"]);
			expect(existsSync(join(OUT_DIR, "_primitives.scss"))).toBe(true);

			const scss = readFileSync(join(OUT_DIR, "_primitives.scss"), "utf-8");
			expect(scss).toContain("$color-");
			expect(scss).toContain("$spacing-");
		});

		test("generates CSS output", async () => {
			await runPrimitives(["-o", OUT_DIR, "-Q"]);
			expect(existsSync(join(OUT_DIR, "primitives.css"))).toBe(true);

			const css = readFileSync(join(OUT_DIR, "primitives.css"), "utf-8");
			expect(css).toContain(":root {");
			expect(css).toContain("--color-");
			expect(css).toContain("--spacing-");
		});

		test("SCSS uses dollar sign variables", async () => {
			await runPrimitives(["-o", OUT_DIR, "-Q"]);

			const scss = readFileSync(join(OUT_DIR, "_primitives.scss"), "utf-8");
			expect(scss).toMatch(/\$[\w-]+:\s*[^;]+;/);
		});

		test("CSS uses custom properties with double dashes", async () => {
			await runPrimitives(["-o", OUT_DIR, "-Q"]);

			const css = readFileSync(join(OUT_DIR, "primitives.css"), "utf-8");
			expect(css).toMatch(/--[\w-]+:\s*[^;]+;/);
		});
	});

	describe("CLI flags", () => {
		test("quiet mode suppresses output", async () => {
			const { stdout } = await runPrimitives(["-o", OUT_DIR, "-Q"]);
			expect(stdout).toBe("");
		});

		test("verbose mode shows detailed output", async () => {
			const { stdout } = await runPrimitives(["-o", OUT_DIR, "-V"]);
			expect(stdout).toContain("Detailed breakdown");
		});

		test("normal mode shows summary", async () => {
			const { stdout } = await runPrimitives(["-o", OUT_DIR]);
			expect(stdout).toContain("Generated primitives");
			expect(stdout).toContain("Color groups");
		});
	});

	describe("error handling", () => {
		test("exits with error if base.json missing", async () => {
			const emptyDir = join(TEST_DIR, "empty");
			mkdirSync(emptyDir, { recursive: true });

			const { stderr, code } = await runPrimitives(["-o", emptyDir]);
			expect(code).toBe(1);
			expect(stderr).toContain("base.json");
		});
	});
});
