import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { INPUTS_DIR, OUTPUTS_DIR } from "../helpers/testUtils.js";

const TEST_DIR = join(OUTPUTS_DIR, ".tmp", "test");
const SRC_DIR = join(TEST_DIR, "src");
const OUT_DIR = join(TEST_DIR, "dist");

/**
 * Runs the scan command.
 * @param {string[]} args - Command arguments
 * @returns {Promise<{stdout: string, stderr: string, code: number}>}
 */
const runScan = (args = []) => {
	return new Promise((resolve) => {
		const proc = spawn("bun", ["src/commands/scan.js", ...args], {
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

describe("scan", () => {
	beforeAll(() => {
		rmSync(TEST_DIR, { recursive: true, force: true });
		mkdirSync(SRC_DIR, { recursive: true });
		mkdirSync(OUT_DIR, { recursive: true });
		mkdirSync(join(SRC_DIR, "components"), { recursive: true });

		writeFileSync(
			join(SRC_DIR, "variables.scss"),
			`
$color-primary: #3b82f6;
$color-secondary: #10b981;
$spacing-base: 4px;
$spacing-lg: 16px;

:root {
  --color-bg: #ffffff;
  --color-text: #1a1a1a;
  --spacing-sm: 8px;
}

body {
  font-family: "Inter", sans-serif;
  font-size: 16px;
  font-weight: 400;
  line-height: 1.5;
  letter-spacing: -0.02em;
}

.card {
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  z-index: 10;
}
`,
		);

		writeFileSync(
			join(SRC_DIR, "components", "button.component.scss"),
			`
.btn {
  font-size: 14px;
  font-weight: 500;
  padding: 8px 16px;
  border-radius: 4px;
  background: #3b82f6;
  color: #ffffff;
}

.btn-secondary {
  background: #6b7280;
}
`,
		);

		writeFileSync(
			join(SRC_DIR, "base.css"),
			`
:root {
  --color-surface: #f9fafb;
}

h1 {
  font-size: 32px;
  font-weight: 700;
  line-height: 1.2;
}

h2 {
  font-size: 24px;
  font-weight: 600;
}
`,
		);
	});

	afterAll(() => {
		rmSync(TEST_DIR, { recursive: true, force: true });
	});

	describe("extractValues patterns", () => {
		test("extracts hex colors in various formats", async () => {
			const tempDir = join(TEST_DIR, "colors-test");
			mkdirSync(tempDir, { recursive: true });
			writeFileSync(
				join(tempDir, "colors.css"),
				`
.a { color: #fff; }
.b { color: #ffffff; }
.c { color: #3b82f6; }
.d { color: #10B981; }
`,
			);
			const outPath = join(tempDir, "out");
			mkdirSync(outPath, { recursive: true });
			await runScan([tempDir, "-o", outPath, "-Q"]);

			const result = JSON.parse(readFileSync(join(outPath, "base.json"), "utf-8"));
			expect(result.colors).toContain("#ffffff");
			expect(result.colors).toContain("#3b82f6");
			expect(result.colors).toContain("#10b981");
		});

		test("extracts rgba colors", async () => {
			const tempDir = join(TEST_DIR, "rgba-test");
			mkdirSync(tempDir, { recursive: true });
			writeFileSync(
				join(tempDir, "colors.css"),
				`.shadow { box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1); }`,
			);
			const outPath = join(tempDir, "out");
			mkdirSync(outPath, { recursive: true });
			await runScan([tempDir, "-o", outPath, "-Q"]);

			const result = JSON.parse(readFileSync(join(outPath, "base.json"), "utf-8"));
			expect(result.colors.some((c) => c.includes("rgba"))).toBe(true);
		});

		test("extracts hsl colors", async () => {
			const tempDir = join(TEST_DIR, "hsl-test");
			mkdirSync(tempDir, { recursive: true });
			writeFileSync(
				join(tempDir, "colors.css"),
				`.a { color: hsl(220, 90%, 56%); } .b { color: hsla(120, 50%, 50%, 0.5); }`,
			);
			const outPath = join(tempDir, "out");
			mkdirSync(outPath, { recursive: true });
			await runScan([tempDir, "-o", outPath, "-Q"]);

			const result = JSON.parse(readFileSync(join(outPath, "base.json"), "utf-8"));
			expect(result.colors.some((c) => c.includes("hsl"))).toBe(true);
		});

		test("extracts spacing values", async () => {
			const tempDir = join(TEST_DIR, "spacing-test");
			mkdirSync(tempDir, { recursive: true });
			writeFileSync(
				join(tempDir, "spacing.css"),
				`
.a { padding: 4px; margin: 8px; }
.b { gap: 1rem; }
.c { margin-left: 2em; }
`,
			);
			const outPath = join(tempDir, "out");
			mkdirSync(outPath, { recursive: true });
			await runScan([tempDir, "-o", outPath, "-Q"]);

			const result = JSON.parse(readFileSync(join(outPath, "base.json"), "utf-8"));
			expect(result.spacing).toContain("4px");
			expect(result.spacing).toContain("8px");
			expect(result.spacing).toContain("1rem");
			expect(result.spacing).toContain("2em");
		});

		test("extracts font families", async () => {
			const tempDir = join(TEST_DIR, "fonts-test");
			mkdirSync(tempDir, { recursive: true });
			writeFileSync(
				join(tempDir, "fonts.css"),
				`body { font-family: "Inter", sans-serif; }`,
			);
			const outPath = join(tempDir, "out");
			mkdirSync(outPath, { recursive: true });
			await runScan([tempDir, "-o", outPath, "-Q"]);

			const result = JSON.parse(readFileSync(join(outPath, "base.json"), "utf-8"));
			expect(result.fontFamilies.some((f) => f.includes("Inter"))).toBe(true);
		});

		test("extracts font sizes", async () => {
			const tempDir = join(TEST_DIR, "font-sizes-test");
			mkdirSync(tempDir, { recursive: true });
			writeFileSync(
				join(tempDir, "sizes.css"),
				`
h1 { font-size: 32px; }
h2 { font-size: 24px; }
body { font-size: 1rem; }
`,
			);
			const outPath = join(tempDir, "out");
			mkdirSync(outPath, { recursive: true });
			await runScan([tempDir, "-o", outPath, "-Q"]);

			const result = JSON.parse(readFileSync(join(outPath, "base.json"), "utf-8"));
			expect(result.fontSizes).toContain("32px");
			expect(result.fontSizes).toContain("24px");
			expect(result.fontSizes).toContain("1rem");
		});

		test("extracts font weights", async () => {
			const tempDir = join(TEST_DIR, "weights-test");
			mkdirSync(tempDir, { recursive: true });
			writeFileSync(
				join(tempDir, "weights.css"),
				`
.normal { font-weight: 400; }
.bold { font-weight: 700; }
`,
			);
			const outPath = join(tempDir, "out");
			mkdirSync(outPath, { recursive: true });
			await runScan([tempDir, "-o", outPath, "-Q"]);

			const result = JSON.parse(readFileSync(join(outPath, "base.json"), "utf-8"));
			expect(result.fontWeights).toContain("400");
			expect(result.fontWeights).toContain("700");
		});

		test("extracts line heights", async () => {
			const tempDir = join(TEST_DIR, "line-heights-test");
			mkdirSync(tempDir, { recursive: true });
			writeFileSync(
				join(tempDir, "line-heights.css"),
				`
body { line-height: 1.5; }
h1 { line-height: 1.2; }
`,
			);
			const outPath = join(tempDir, "out");
			mkdirSync(outPath, { recursive: true });
			await runScan([tempDir, "-o", outPath, "-Q"]);

			const result = JSON.parse(readFileSync(join(outPath, "base.json"), "utf-8"));
			expect(result.lineHeights).toContain("1.5");
			expect(result.lineHeights).toContain("1.2");
		});

		test("extracts letter spacing", async () => {
			const tempDir = join(TEST_DIR, "letter-spacing-test");
			mkdirSync(tempDir, { recursive: true });
			writeFileSync(
				join(tempDir, "letter-spacing.css"),
				`
body { letter-spacing: -0.02em; }
h1 { letter-spacing: 0.05em; }
`,
			);
			const outPath = join(tempDir, "out");
			mkdirSync(outPath, { recursive: true });
			await runScan([tempDir, "-o", outPath, "-Q"]);

			const result = JSON.parse(readFileSync(join(outPath, "base.json"), "utf-8"));
			expect(result.letterSpacings).toContain("-0.02em");
			expect(result.letterSpacings).toContain("0.05em");
		});

		test("extracts border radii", async () => {
			const tempDir = join(TEST_DIR, "border-radius-test");
			mkdirSync(tempDir, { recursive: true });
			writeFileSync(
				join(tempDir, "borders.css"),
				`
.sm { border-radius: 4px; }
.lg { border-radius: 8px; }
.full { border-radius: 9999px; }
`,
			);
			const outPath = join(tempDir, "out");
			mkdirSync(outPath, { recursive: true });
			await runScan([tempDir, "-o", outPath, "-Q"]);

			const result = JSON.parse(readFileSync(join(outPath, "base.json"), "utf-8"));
			expect(result.borderRadii).toContain("4px");
			expect(result.borderRadii).toContain("8px");
			expect(result.borderRadii).toContain("9999px");
		});

		test("extracts box shadows", async () => {
			const tempDir = join(TEST_DIR, "shadows-test");
			mkdirSync(tempDir, { recursive: true });
			writeFileSync(
				join(tempDir, "shadows.css"),
				`.card { box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1); }`,
			);
			const outPath = join(tempDir, "out");
			mkdirSync(outPath, { recursive: true });
			await runScan([tempDir, "-o", outPath, "-Q"]);

			const result = JSON.parse(readFileSync(join(outPath, "base.json"), "utf-8"));
			expect(result.shadows.length).toBeGreaterThan(0);
		});

		test("extracts z-index values", async () => {
			const tempDir = join(TEST_DIR, "zindex-test");
			mkdirSync(tempDir, { recursive: true });
			writeFileSync(
				join(tempDir, "zindex.css"),
				`
.modal { z-index: 100; }
.tooltip { z-index: 200; }
`,
			);
			const outPath = join(tempDir, "out");
			mkdirSync(outPath, { recursive: true });
			await runScan([tempDir, "-o", outPath, "-Q"]);

			const result = JSON.parse(readFileSync(join(outPath, "base.json"), "utf-8"));
			expect(result.zIndices).toContain("100");
			expect(result.zIndices).toContain("200");
		});

		test("extracts SCSS variables", async () => {
			const tempDir = join(TEST_DIR, "scss-vars-test");
			mkdirSync(tempDir, { recursive: true });
			writeFileSync(
				join(tempDir, "vars.scss"),
				`
$color-primary: #3b82f6;
$spacing-base: 4px;
`,
			);
			const outPath = join(tempDir, "out");
			mkdirSync(outPath, { recursive: true });
			await runScan([tempDir, "-o", outPath, "-Q"]);

			const result = JSON.parse(readFileSync(join(outPath, "base.json"), "utf-8"));
			expect(result.variables["color-primary"]).toBe("#3b82f6");
			expect(result.variables["spacing-base"]).toBe("4px");
		});

		test("extracts CSS custom properties", async () => {
			const tempDir = join(TEST_DIR, "css-vars-test");
			mkdirSync(tempDir, { recursive: true });
			writeFileSync(
				join(tempDir, "vars.css"),
				`
:root {
  --color-bg: #ffffff;
  --spacing-sm: 8px;
}
`,
			);
			const outPath = join(tempDir, "out");
			mkdirSync(outPath, { recursive: true });
			await runScan([tempDir, "-o", outPath, "-Q"]);

			const result = JSON.parse(readFileSync(join(outPath, "base.json"), "utf-8"));
			expect(result.variables["color-bg"]).toBe("#ffffff");
			expect(result.variables["spacing-sm"]).toBe("8px");
		});
	});

	describe("mergeResults", () => {
		test("merges multiple files into one result", async () => {
			await runScan([SRC_DIR, "-o", OUT_DIR, "-Q"]);

			const base = JSON.parse(readFileSync(join(OUT_DIR, "base.json"), "utf-8"));
			expect(base.sources.length).toBeGreaterThan(1);
			expect(base.colors.length).toBeGreaterThan(0);
			expect(base.fontSizes.length).toBeGreaterThan(0);
		});

		test("deduplicates values across files", async () => {
			const tempDir = join(TEST_DIR, "dedup-test");
			mkdirSync(tempDir, { recursive: true });
			writeFileSync(join(tempDir, "a.css"), `.a { color: #ffffff; }`);
			writeFileSync(join(tempDir, "b.css"), `.b { color: #ffffff; }`);
			const outPath = join(tempDir, "out");
			mkdirSync(outPath, { recursive: true });
			await runScan([tempDir, "-o", outPath, "-Q"]);

			const result = JSON.parse(readFileSync(join(outPath, "base.json"), "utf-8"));
			const whiteCount = result.colors.filter((c) => c === "#ffffff").length;
			expect(whiteCount).toBe(1);
		});

		test("sorts values alphabetically", async () => {
			const tempDir = join(TEST_DIR, "sort-test");
			mkdirSync(tempDir, { recursive: true });
			writeFileSync(
				join(tempDir, "colors.css"),
				`.a { color: #ffffff; } .b { color: #000000; } .c { color: #aabbcc; }`,
			);
			const outPath = join(tempDir, "out");
			mkdirSync(outPath, { recursive: true });
			await runScan([tempDir, "-o", outPath, "-Q"]);

			const result = JSON.parse(readFileSync(join(outPath, "base.json"), "utf-8"));
			const sorted = [...result.colors].sort();
			expect(result.colors).toEqual(sorted);
		});
	});

	describe("file separation", () => {
		test("separates base and component files", async () => {
			await runScan([SRC_DIR, "-o", OUT_DIR, "-Q"]);

			const base = JSON.parse(readFileSync(join(OUT_DIR, "base.json"), "utf-8"));
			const components = JSON.parse(
				readFileSync(join(OUT_DIR, "components.json"), "utf-8"),
			);

			expect(base.sources.some((s) => s.includes("variables.scss"))).toBe(true);
			expect(base.sources.some((s) => s.includes("base.css"))).toBe(true);
			expect(components.sources.some((s) => s.includes("button.component.scss"))).toBe(
				true,
			);
		});

		test("component files not in base results", async () => {
			await runScan([SRC_DIR, "-o", OUT_DIR, "-Q"]);

			const base = JSON.parse(readFileSync(join(OUT_DIR, "base.json"), "utf-8"));
			expect(base.sources.some((s) => s.includes(".component."))).toBe(false);
		});
	});

	describe("CLI flags", () => {
		test("respects -o output directory flag", async () => {
			const customOut = join(TEST_DIR, "custom-out");
			mkdirSync(customOut, { recursive: true });
			await runScan([SRC_DIR, "-o", customOut, "-Q"]);

			expect(existsSync(join(customOut, "base.json"))).toBe(true);
		});

		test("respects --out output directory flag", async () => {
			const customOut = join(TEST_DIR, "custom-out-2");
			mkdirSync(customOut, { recursive: true });
			await runScan([SRC_DIR, "--out", customOut, "-Q"]);

			expect(existsSync(join(customOut, "base.json"))).toBe(true);
		});

		test("dry run mode does not create files", async () => {
			const dryRunOut = join(TEST_DIR, "dry-run-out");
			await runScan([SRC_DIR, "-o", dryRunOut, "-N"]);

			expect(existsSync(join(dryRunOut, "base.json"))).toBe(false);
		});

		test("quiet mode suppresses output", async () => {
			const { stdout } = await runScan([SRC_DIR, "-o", OUT_DIR, "-Q"]);
			expect(stdout).toBe("");
		});

		test("verbose mode shows extra output", async () => {
			const { stdout } = await runScan([SRC_DIR, "-o", OUT_DIR, "-V"]);
			expect(stdout).toContain("Detailed breakdown");
		});
	});

	describe("with fixture data", () => {
		test("processes sampleDartSassLibrary fixture", async () => {
			const fixtureDir = join(INPUTS_DIR, "sampleDartSassLibrary");
			if (!existsSync(fixtureDir)) {
				return;
			}

			const outPath = join(TEST_DIR, "fixture-out");
			mkdirSync(outPath, { recursive: true });
			await runScan([fixtureDir, "-o", outPath, "-Q"]);

			const base = JSON.parse(readFileSync(join(outPath, "base.json"), "utf-8"));
			expect(base.colors.length).toBeGreaterThan(0);
			expect(base.variables).toBeDefined();
			expect(Object.keys(base.variables).length).toBeGreaterThan(0);
		});
	});
});
