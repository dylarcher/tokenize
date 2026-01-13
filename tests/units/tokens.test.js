import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { OUTPUTS_DIR } from "../helpers/testUtils.js";

const TEST_DIR = join(OUTPUTS_DIR, ".tmp", "tokens-test");
const OUT_DIR = join(TEST_DIR, "dist");

/**
 * Runs the tokens command.
 * @param {string[]} args - Command arguments
 * @returns {Promise<{stdout: string, stderr: string, code: number}>}
 */
const runTokens = (args = []) => {
	return new Promise((resolve) => {
		const proc = spawn("bun", ["src/commands/tokens.js", ...args], {
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

describe("tokens", () => {
	beforeAll(() => {
		rmSync(TEST_DIR, { recursive: true, force: true });
		mkdirSync(OUT_DIR, { recursive: true });

		const scanBase = {
			colors: ["#3b82f6", "#60a5fa", "#10b981", "#ef4444", "#ffffff", "#000000", "#808080"],
			spacing: ["4px", "8px", "16px", "24px", "32px"],
			fontFamilies: ['"Inter", sans-serif'],
			fontSizes: ["12px", "14px", "16px", "18px", "24px"],
			fontWeights: ["400", "500", "600", "700"],
			lineHeights: ["1", "1.25", "1.5"],
			letterSpacings: ["-0.02em", "0"],
			borderRadii: ["4px", "8px", "9999px"],
			borderWidths: ["1px"],
			shadows: ["0 1px 2px rgba(0,0,0,0.05)", "0 2px 4px rgba(0,0,0,0.1)"],
			zIndices: ["1", "10", "100"],
			variables: {},
			sources: ["test.scss"],
		};

		writeFileSync(join(OUT_DIR, "base.json"), JSON.stringify(scanBase, null, 2));
	});

	afterAll(() => {
		rmSync(TEST_DIR, { recursive: true, force: true });
	});

	describe("argument parsing", () => {
		test("shows help with -h flag", async () => {
			const { stdout, code } = await runTokens(["-h"]);
			expect(code).toBe(0);
			expect(stdout).toContain("Usage:");
			expect(stdout).toContain("primitives");
			expect(stdout).toContain("semantic");
			expect(stdout).toContain("components");
		});

		test("shows help with --help flag", async () => {
			const { stdout, code } = await runTokens(["--help"]);
			expect(code).toBe(0);
			expect(stdout).toContain("Usage:");
		});

		test("accepts layer as positional argument", async () => {
			const { code } = await runTokens(["primitives", "-o", OUT_DIR, "-Q"]);
			expect(code).toBe(0);
		});

		test("accepts layer with -l flag", async () => {
			const { code } = await runTokens(["-l", "primitives", "-o", OUT_DIR, "-Q"]);
			expect(code).toBe(0);
		});

		test("exits with error when no layers specified", async () => {
			const { code, stdout } = await runTokens(["-o", OUT_DIR]);
			expect(code).toBe(1);
			expect(stdout).toContain("No layers specified");
		});
	});

	describe("layer generation", () => {
		test("generates primitives layer", async () => {
			const { code } = await runTokens(["primitives", "-o", OUT_DIR, "-Q"]);
			expect(code).toBe(0);
			expect(existsSync(join(OUT_DIR, "primitives.json"))).toBe(true);
		});

		test("generates semantic layer with dependencies", async () => {
			await runTokens(["primitives", "-o", OUT_DIR, "-Q"]);

			const { code } = await runTokens(["semantic", "-o", OUT_DIR, "-Q"]);
			expect(code).toBe(0);
			expect(existsSync(join(OUT_DIR, "semantic.json"))).toBe(true);
		});

		test("generates components layer with dependencies", async () => {
			await runTokens(["primitives", "-o", OUT_DIR, "-Q"]);
			await runTokens(["semantic", "-o", OUT_DIR, "-Q"]);

			const { code } = await runTokens(["components", "-o", OUT_DIR, "-Q"]);
			expect(code).toBe(0);
			expect(existsSync(join(OUT_DIR, "components.json"))).toBe(true);
		});

		test("generates all layers with --all flag", async () => {
			const allOut = join(TEST_DIR, "all-out");
			mkdirSync(allOut, { recursive: true });
			writeFileSync(join(allOut, "base.json"), readFileSync(join(OUT_DIR, "base.json")));

			const { code } = await runTokens(["--all", "-o", allOut, "-Q"]);
			expect(code).toBe(0);
			expect(existsSync(join(allOut, "primitives.json"))).toBe(true);
			expect(existsSync(join(allOut, "semantic.json"))).toBe(true);
			expect(existsSync(join(allOut, "components.json"))).toBe(true);
		});
	});

	describe("dependency management", () => {
		test("auto-generates dependencies when needed", async () => {
			const depOut = join(TEST_DIR, "dep-out");
			mkdirSync(depOut, { recursive: true });
			writeFileSync(join(depOut, "base.json"), readFileSync(join(OUT_DIR, "base.json")));

			await runTokens(["semantic", "-o", depOut, "-Q"]);
			expect(existsSync(join(depOut, "primitives.json"))).toBe(true);
		});

		test("respects layer order: primitives -> semantic -> components", async () => {
			const orderOut = join(TEST_DIR, "order-out");
			mkdirSync(orderOut, { recursive: true });
			writeFileSync(join(orderOut, "base.json"), readFileSync(join(OUT_DIR, "base.json")));

			const { code, stdout } = await runTokens(["--all", "-o", orderOut]);
			expect(code).toBe(0);
			expect(stdout).toContain("primitives");
		});
	});

	describe("force regeneration", () => {
		test("regenerates explicitly requested layers", async () => {
			const forceOut = join(TEST_DIR, "force-out");
			mkdirSync(forceOut, { recursive: true });
			writeFileSync(join(forceOut, "base.json"), readFileSync(join(OUT_DIR, "base.json")));

			await runTokens(["primitives", "-o", forceOut, "-Q"]);

			// When explicitly requesting a layer, it regenerates even if it exists
			const { stdout, code } = await runTokens(["primitives", "-o", forceOut]);
			expect(code).toBe(0);
			expect(stdout).toContain("Generating primitives");
		});

		test("--force flag works for all layers", async () => {
			const forceOut = join(TEST_DIR, "force-out2");
			mkdirSync(forceOut, { recursive: true });
			writeFileSync(join(forceOut, "base.json"), readFileSync(join(OUT_DIR, "base.json")));

			await runTokens(["primitives", "-o", forceOut, "-Q"]);

			const { code, stdout } = await runTokens(["primitives", "--force", "-o", forceOut]);
			expect(code).toBe(0);
			expect(stdout).toContain("Generating");
		});
	});

	describe("dry run mode", () => {
		test("shows what would be generated without creating files", async () => {
			const dryOut = join(TEST_DIR, "dry-out");

			const { stdout } = await runTokens(["--all", "-o", dryOut, "-N"]);
			expect(stdout).toContain("[DRY RUN]");
			expect(stdout).toContain("primitives.json");
			expect(existsSync(join(dryOut, "primitives.json"))).toBe(false);
		});
	});

	describe("CLI flags", () => {
		test("quiet mode suppresses output", async () => {
			const quietOut = join(TEST_DIR, "quiet-out");
			mkdirSync(quietOut, { recursive: true });
			writeFileSync(join(quietOut, "base.json"), readFileSync(join(OUT_DIR, "base.json")));

			const { stdout } = await runTokens(["primitives", "-o", quietOut, "-Q"]);
			expect(stdout).toBe("");
		});

		test("respects -o output directory", async () => {
			const customOut = join(TEST_DIR, "custom-tokens");
			mkdirSync(customOut, { recursive: true });
			writeFileSync(join(customOut, "base.json"), readFileSync(join(OUT_DIR, "base.json")));

			await runTokens(["primitives", "-o", customOut, "-Q"]);
			expect(existsSync(join(customOut, "primitives.json"))).toBe(true);
		});
	});

	describe("error handling", () => {
		test("fails when dependencies are missing and not auto-generating", async () => {
			const errorOut = join(TEST_DIR, "error-out");
			mkdirSync(errorOut, { recursive: true });

			const { code } = await runTokens(["components", "-o", errorOut, "-Q"]);
			expect(code).toBe(1);
		});
	});
});
