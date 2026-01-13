import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdirSync, writeFileSync, rmSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { OUTPUTS_DIR } from "../helpers/testUtils.js";

const TEST_DIR = join(OUTPUTS_DIR, ".tmp", "semantic-test");
const OUT_DIR = join(TEST_DIR, "dist");

/**
 * Runs the semantic generator.
 * @param {string[]} args - Command arguments
 * @returns {Promise<{stdout: string, stderr: string, code: number}>}
 */
const runSemantic = (args = []) => {
	return new Promise((resolve) => {
		const proc = spawn(
			"bun",
			["src/generators/semantic.js", ...args],
			{ cwd: join(import.meta.dir, "../..") },
		);
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

describe("semantic", () => {
	beforeAll(() => {
		rmSync(TEST_DIR, { recursive: true, force: true });
		mkdirSync(OUT_DIR, { recursive: true });

		const primitives = {
			color: {
				blue: { 100: "#dbeafe", 300: "#93c5fd", 500: "#3b82f6", 700: "#1d4ed8", 900: "#1e3a8a" },
				green: { 100: "#dcfce7", 300: "#86efac", 500: "#22c55e", 700: "#15803d", 900: "#14532d" },
				red: { 100: "#fee2e2", 300: "#fca5a5", 500: "#ef4444", 700: "#b91c1c", 900: "#7f1d1d" },
				yellow: { 100: "#fef9c3", 300: "#fde047", 500: "#eab308", 700: "#a16207", 900: "#713f12" },
				orange: { 100: "#ffedd5", 300: "#fdba74", 500: "#f97316", 700: "#c2410c", 900: "#7c2d12" },
				neutral: { 100: "#f5f5f5", 300: "#d4d4d4", 500: "#737373", 700: "#404040", 900: "#171717" },
			},
			spacing: { 1: "4px", 2: "8px", 4: "16px", 6: "24px", 8: "32px" },
			typography: {
				fontFamily: { primary: '"Inter", sans-serif', secondary: '"Roboto Mono", monospace' },
				fontSize: { xs: "12px", sm: "14px", base: "16px", lg: "18px", xl: "20px" },
				fontWeight: { normal: "400", medium: "500", semibold: "600", bold: "700" },
				lineHeight: { tight: "1.25", normal: "1.5", relaxed: "1.75" },
				letterSpacing: { tight: "-0.02em", normal: "0", wide: "0.05em" },
			},
			border: {
				radius: { none: "0", sm: "4px", md: "8px", lg: "12px", full: "9999px" },
				width: {},
			},
			shadow: {
				sm: "0 1px 2px rgba(0,0,0,0.05)",
				md: "0 2px 4px rgba(0,0,0,0.1)",
				lg: "0 4px 8px rgba(0,0,0,0.15)",
			},
			zIndex: { base: 1, dropdown: 10, sticky: 50, modal: 100, tooltip: 999 },
		};

		writeFileSync(join(OUT_DIR, "primitives.json"), JSON.stringify(primitives, null, 2));
	});

	afterAll(() => {
		rmSync(TEST_DIR, { recursive: true, force: true });
	});

	describe("surface tokens", () => {
		test("generates surface color references", async () => {
			await runSemantic(["-o", OUT_DIR, "-Q"]);

			const semantic = JSON.parse(readFileSync(join(OUT_DIR, "semantic.json"), "utf-8"));
			expect(semantic.surface).toBeDefined();
			expect(semantic.surface.default).toContain("{color.neutral.");
			expect(semantic.surface.secondary).toContain("{color.neutral.");
			expect(semantic.surface.inverse).toContain("{color.neutral.");
		});

		test("uses lightest neutral for default surface", async () => {
			await runSemantic(["-o", OUT_DIR, "-Q"]);

			const semantic = JSON.parse(readFileSync(join(OUT_DIR, "semantic.json"), "utf-8"));
			expect(semantic.surface.default).toBe("{color.neutral.100}");
		});

		test("uses darkest neutral for inverse surface", async () => {
			await runSemantic(["-o", OUT_DIR, "-Q"]);

			const semantic = JSON.parse(readFileSync(join(OUT_DIR, "semantic.json"), "utf-8"));
			expect(semantic.surface.inverse).toBe("{color.neutral.900}");
		});
	});

	describe("text tokens", () => {
		test("generates text color references", async () => {
			await runSemantic(["-o", OUT_DIR, "-Q"]);

			const semantic = JSON.parse(readFileSync(join(OUT_DIR, "semantic.json"), "utf-8"));
			expect(semantic.text).toBeDefined();
			expect(semantic.text.primary).toBeDefined();
			expect(semantic.text.secondary).toBeDefined();
			expect(semantic.text.inverse).toBeDefined();
			expect(semantic.text.link).toBeDefined();
		});

		test("uses darkest neutral for primary text", async () => {
			await runSemantic(["-o", OUT_DIR, "-Q"]);

			const semantic = JSON.parse(readFileSync(join(OUT_DIR, "semantic.json"), "utf-8"));
			expect(semantic.text.primary).toBe("{color.neutral.900}");
		});

		test("uses primary color for link text", async () => {
			await runSemantic(["-o", OUT_DIR, "-Q"]);

			const semantic = JSON.parse(readFileSync(join(OUT_DIR, "semantic.json"), "utf-8"));
			expect(semantic.text.link).toContain("{color.blue.");
		});
	});

	describe("border tokens", () => {
		test("generates border color references", async () => {
			await runSemantic(["-o", OUT_DIR, "-Q"]);

			const semantic = JSON.parse(readFileSync(join(OUT_DIR, "semantic.json"), "utf-8"));
			expect(semantic.border).toBeDefined();
			expect(semantic.border.default).toBeDefined();
			expect(semantic.border.subtle).toBeDefined();
			expect(semantic.border.strong).toBeDefined();
			expect(semantic.border.focus).toBeDefined();
		});

		test("uses primary color for focus border", async () => {
			await runSemantic(["-o", OUT_DIR, "-Q"]);

			const semantic = JSON.parse(readFileSync(join(OUT_DIR, "semantic.json"), "utf-8"));
			expect(semantic.border.focus).toContain("{color.blue.");
		});
	});

	describe("interactive tokens", () => {
		test("generates primary interactive states", async () => {
			await runSemantic(["-o", OUT_DIR, "-Q"]);

			const semantic = JSON.parse(readFileSync(join(OUT_DIR, "semantic.json"), "utf-8"));
			expect(semantic.interactive.primary).toBeDefined();
			expect(semantic.interactive.primary.default).toBeDefined();
			expect(semantic.interactive.primary.hover).toBeDefined();
			expect(semantic.interactive.primary.active).toBeDefined();
			expect(semantic.interactive.primary.disabled).toBeDefined();
		});

		test("generates secondary interactive states when multiple colors available", async () => {
			await runSemantic(["-o", OUT_DIR, "-Q"]);

			const semantic = JSON.parse(readFileSync(join(OUT_DIR, "semantic.json"), "utf-8"));
			expect(semantic.interactive.secondary).toBeDefined();
		});

		test("uses neutral for disabled state", async () => {
			await runSemantic(["-o", OUT_DIR, "-Q"]);

			const semantic = JSON.parse(readFileSync(join(OUT_DIR, "semantic.json"), "utf-8"));
			expect(semantic.interactive.primary.disabled).toContain("{color.neutral.");
		});
	});

	describe("feedback tokens", () => {
		test("generates feedback tokens for available colors", async () => {
			await runSemantic(["-o", OUT_DIR, "-Q"]);

			const semantic = JSON.parse(readFileSync(join(OUT_DIR, "semantic.json"), "utf-8"));
			expect(semantic.feedback).toBeDefined();
			expect(semantic.feedback.success).toBeDefined();
			expect(semantic.feedback.error).toBeDefined();
		});

		test("feedback tokens have bg, border, and text", async () => {
			await runSemantic(["-o", OUT_DIR, "-Q"]);

			const semantic = JSON.parse(readFileSync(join(OUT_DIR, "semantic.json"), "utf-8"));
			expect(semantic.feedback.success.bg).toBeDefined();
			expect(semantic.feedback.success.border).toBeDefined();
			expect(semantic.feedback.success.text).toBeDefined();
		});

		test("maps green to success", async () => {
			await runSemantic(["-o", OUT_DIR, "-Q"]);

			const semantic = JSON.parse(readFileSync(join(OUT_DIR, "semantic.json"), "utf-8"));
			expect(semantic.feedback.success.bg).toContain("{color.green.");
		});

		test("maps red to error", async () => {
			await runSemantic(["-o", OUT_DIR, "-Q"]);

			const semantic = JSON.parse(readFileSync(join(OUT_DIR, "semantic.json"), "utf-8"));
			expect(semantic.feedback.error.bg).toContain("{color.red.");
		});
	});

	describe("typography tokens", () => {
		test("generates body typography tokens", async () => {
			await runSemantic(["-o", OUT_DIR, "-Q"]);

			const semantic = JSON.parse(readFileSync(join(OUT_DIR, "semantic.json"), "utf-8"));
			expect(semantic.typography.body).toBeDefined();
			expect(semantic.typography.body.fontFamily).toBe("{typography.fontFamily.primary}");
			expect(semantic.typography.body.fontSize).toBe("{typography.fontSize.base}");
		});

		test("generates heading typography tokens", async () => {
			await runSemantic(["-o", OUT_DIR, "-Q"]);

			const semantic = JSON.parse(readFileSync(join(OUT_DIR, "semantic.json"), "utf-8"));
			expect(semantic.typography.heading).toBeDefined();
			expect(semantic.typography.heading.fontWeight).toBe("{typography.fontWeight.bold}");
		});

		test("generates caption typography tokens", async () => {
			await runSemantic(["-o", OUT_DIR, "-Q"]);

			const semantic = JSON.parse(readFileSync(join(OUT_DIR, "semantic.json"), "utf-8"));
			expect(semantic.typography.caption).toBeDefined();
			expect(semantic.typography.caption.fontSize).toBe("{typography.fontSize.sm}");
		});
	});

	describe("spacing tokens", () => {
		test("generates inset spacing tokens", async () => {
			await runSemantic(["-o", OUT_DIR, "-Q"]);

			const semantic = JSON.parse(readFileSync(join(OUT_DIR, "semantic.json"), "utf-8"));
			expect(semantic.spacing.inset).toBeDefined();
			expect(semantic.spacing.inset.xs).toBe("{spacing.1}");
			expect(semantic.spacing.inset.md).toBe("{spacing.4}");
		});

		test("generates stack spacing tokens", async () => {
			await runSemantic(["-o", OUT_DIR, "-Q"]);

			const semantic = JSON.parse(readFileSync(join(OUT_DIR, "semantic.json"), "utf-8"));
			expect(semantic.spacing.stack).toBeDefined();
		});

		test("generates inline spacing tokens", async () => {
			await runSemantic(["-o", OUT_DIR, "-Q"]);

			const semantic = JSON.parse(readFileSync(join(OUT_DIR, "semantic.json"), "utf-8"));
			expect(semantic.spacing.inline).toBeDefined();
		});
	});

	describe("elevation tokens", () => {
		test("generates elevation tokens", async () => {
			await runSemantic(["-o", OUT_DIR, "-Q"]);

			const semantic = JSON.parse(readFileSync(join(OUT_DIR, "semantic.json"), "utf-8"));
			expect(semantic.elevation).toBeDefined();
			expect(semantic.elevation.none).toBe("none");
			expect(semantic.elevation.low).toBe("{shadow.sm}");
			expect(semantic.elevation.medium).toBe("{shadow.md}");
		});
	});

	describe("radius tokens", () => {
		test("generates radius tokens", async () => {
			await runSemantic(["-o", OUT_DIR, "-Q"]);

			const semantic = JSON.parse(readFileSync(join(OUT_DIR, "semantic.json"), "utf-8"));
			expect(semantic.radius).toBeDefined();
			expect(semantic.radius.none).toBe("0");
			expect(semantic.radius.small).toBe("{border.radius.sm}");
			expect(semantic.radius.pill).toBe("{border.radius.full}");
		});
	});

	describe("layer tokens", () => {
		test("generates z-index layer tokens", async () => {
			await runSemantic(["-o", OUT_DIR, "-Q"]);

			const semantic = JSON.parse(readFileSync(join(OUT_DIR, "semantic.json"), "utf-8"));
			expect(semantic.layer).toBeDefined();
			expect(semantic.layer.base).toBe("{zIndex.base}");
			expect(semantic.layer.modal).toBe("{zIndex.modal}");
		});
	});

	describe("output formats", () => {
		test("generates JSON output", async () => {
			await runSemantic(["-o", OUT_DIR, "-Q"]);
			expect(existsSync(join(OUT_DIR, "semantic.json"))).toBe(true);
		});

		test("generates SCSS output with primitive references", async () => {
			await runSemantic(["-o", OUT_DIR, "-Q"]);
			expect(existsSync(join(OUT_DIR, "_semantic.scss"))).toBe(true);

			const scss = readFileSync(join(OUT_DIR, "_semantic.scss"), "utf-8");
			expect(scss).toContain('@use "primitives" as p');
			expect(scss).toContain("p.$color-");
		});

		test("generates CSS output with var() references", async () => {
			await runSemantic(["-o", OUT_DIR, "-Q"]);
			expect(existsSync(join(OUT_DIR, "semantic.css"))).toBe(true);

			const css = readFileSync(join(OUT_DIR, "semantic.css"), "utf-8");
			expect(css).toContain(":root {");
			expect(css).toContain("var(--color-");
		});
	});

	describe("CLI flags", () => {
		test("quiet mode suppresses output", async () => {
			const { stdout } = await runSemantic(["-o", OUT_DIR, "-Q"]);
			expect(stdout).toBe("");
		});

		test("verbose mode shows extra output", async () => {
			const { stdout } = await runSemantic(["-o", OUT_DIR, "-V"]);
			expect(stdout).toContain("Token references");
			expect(stdout).toContain("Primary color");
		});
	});

	describe("error handling", () => {
		test("exits with error if primitives.json missing", async () => {
			const emptyDir = join(TEST_DIR, "empty");
			mkdirSync(emptyDir, { recursive: true });

			const { stderr, code } = await runSemantic(["-o", emptyDir]);
			expect(code).toBe(1);
			expect(stderr).toContain("primitives");
		});
	});
});
