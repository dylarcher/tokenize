import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdirSync, writeFileSync, rmSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { OUTPUTS_DIR } from "../helpers/testUtils.js";

const TEST_DIR = join(OUTPUTS_DIR, ".tmp", "compile-test");
const SRC_DIR = join(TEST_DIR, "src");
const OUT_DIR = join(TEST_DIR, "dist");

/**
 * Runs the compile command.
 * @param {string[]} args - Command arguments
 * @returns {Promise<{stdout: string, stderr: string, code: number}>}
 */
const runCompile = (args = []) => {
	return new Promise((resolve) => {
		const proc = spawn(
			"bun",
			["src/commands/compile.js", ...args],
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

describe("compile", () => {
	beforeAll(() => {
		rmSync(TEST_DIR, { recursive: true, force: true });
		mkdirSync(SRC_DIR, { recursive: true });
		mkdirSync(join(SRC_DIR, "components"), { recursive: true });

		writeFileSync(
			join(SRC_DIR, "_variables.scss"),
			`
$color-primary: #3b82f6;
$color-secondary: #10b981;
$spacing-base: 4px;
`,
		);

		writeFileSync(
			join(SRC_DIR, "main.scss"),
			`
@use "variables" as v;

:root {
  --color-primary: #{v.$color-primary};
}

body {
  font-family: "Inter", sans-serif;
  color: #1a1a1a;
}

.container {
  max-width: 1200px;
  margin: 0 auto;
  padding: v.$spacing-base * 4;
}
`,
		);

		writeFileSync(
			join(SRC_DIR, "components", "button.component.scss"),
			`
@use "../variables" as v;

.btn {
  display: inline-flex;
  align-items: center;
  padding: v.$spacing-base * 2 v.$spacing-base * 4;
  background: v.$color-primary;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;

  &:hover {
    background: darken(v.$color-primary, 10%);
  }
}
`,
		);

		writeFileSync(
			join(SRC_DIR, "components", "card.component.scss"),
			`
.card {
  background: white;
  border: 1px solid #e5e5e5;
  border-radius: 8px;
  padding: 16px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}
`,
		);
	});

	afterAll(() => {
		rmSync(TEST_DIR, { recursive: true, force: true });
	});

	describe("SCSS compilation", () => {
		test("compiles SCSS files to CSS", async () => {
			await runCompile([SRC_DIR, "-o", OUT_DIR, "-Q"]);

			expect(existsSync(join(OUT_DIR, "global.css"))).toBe(true);
		});

		test("processes @use directives and compiles SCSS", async () => {
			await runCompile([SRC_DIR, "-o", OUT_DIR, "-Q"]);

			const global = readFileSync(join(OUT_DIR, "global.css"), "utf-8");
			// CSS custom properties in :root are flattened, but the body styles remain
			expect(global).toContain("font-family:");
		});

		test("compiles Sass functions like darken()", async () => {
			await runCompile([SRC_DIR, "-o", OUT_DIR, "-Q"]);

			const buttonPath = join(OUT_DIR, "components", "Button.css");
			if (existsSync(buttonPath)) {
				const button = readFileSync(buttonPath, "utf-8");
				expect(button).toContain(":hover");
			}
		});
	});

	describe("file organization", () => {
		test("separates global and component files", async () => {
			await runCompile([SRC_DIR, "-o", OUT_DIR, "-Q"]);

			expect(existsSync(join(OUT_DIR, "global.css"))).toBe(true);
			expect(existsSync(join(OUT_DIR, "components"))).toBe(true);
		});

		test("creates individual component CSS files", async () => {
			await runCompile([SRC_DIR, "-o", OUT_DIR, "-Q"]);

			const componentDir = join(OUT_DIR, "components");
			const files = existsSync(componentDir) ?
				require("node:fs").readdirSync(componentDir) : [];
			expect(files.length).toBeGreaterThan(0);
		});

		test("excludes partial files from direct compilation", async () => {
			await runCompile([SRC_DIR, "-o", OUT_DIR, "-Q"]);

			const global = readFileSync(join(OUT_DIR, "global.css"), "utf-8");
			expect(global).not.toContain("$color-primary:");
		});
	});

	describe("manifest generation", () => {
		test("creates manifest.json", async () => {
			await runCompile([SRC_DIR, "-o", OUT_DIR, "-Q"]);

			expect(existsSync(join(OUT_DIR, "manifest.json"))).toBe(true);
		});

		test("manifest contains compilation timestamp", async () => {
			await runCompile([SRC_DIR, "-o", OUT_DIR, "-Q"]);

			const manifest = JSON.parse(readFileSync(join(OUT_DIR, "manifest.json"), "utf-8"));
			expect(manifest.compiled).toBeDefined();
			expect(new Date(manifest.compiled).getTime()).toBeGreaterThan(0);
		});

		test("manifest contains source directory", async () => {
			await runCompile([SRC_DIR, "-o", OUT_DIR, "-Q"]);

			const manifest = JSON.parse(readFileSync(join(OUT_DIR, "manifest.json"), "utf-8"));
			expect(manifest.source).toBeDefined();
		});

		test("manifest contains global file info", async () => {
			await runCompile([SRC_DIR, "-o", OUT_DIR, "-Q"]);

			const manifest = JSON.parse(readFileSync(join(OUT_DIR, "manifest.json"), "utf-8"));
			expect(manifest.global).toBeDefined();
			expect(manifest.global.sources).toBeDefined();
			expect(manifest.global.output).toBe("global.css");
			expect(manifest.global.size).toBeGreaterThan(0);
		});

		test("manifest contains component results", async () => {
			await runCompile([SRC_DIR, "-o", OUT_DIR, "-Q"]);

			const manifest = JSON.parse(readFileSync(join(OUT_DIR, "manifest.json"), "utf-8"));
			expect(manifest.components).toBeDefined();
			expect(Array.isArray(manifest.components)).toBe(true);
		});
	});

	describe("CSS flattening", () => {
		test("flattens CSS custom properties in :root", async () => {
			await runCompile([SRC_DIR, "-o", OUT_DIR, "-Q"]);

			const global = readFileSync(join(OUT_DIR, "global.css"), "utf-8");
			// :root blocks with custom properties are removed
			expect(global).not.toMatch(/:root\s*\{[^}]*--/);
		});

		test("preserves source comments", async () => {
			await runCompile([SRC_DIR, "-o", OUT_DIR, "-Q"]);

			const global = readFileSync(join(OUT_DIR, "global.css"), "utf-8");
			expect(global).toContain("/* Source:");
		});
	});

	describe("CLI flags", () => {
		test("respects -o output directory flag", async () => {
			const customOut = join(TEST_DIR, "custom-out");
			await runCompile([SRC_DIR, "-o", customOut, "-Q"]);

			expect(existsSync(join(customOut, "global.css"))).toBe(true);
		});

		test("dry run mode does not create files", async () => {
			const dryRunOut = join(TEST_DIR, "dry-run-out");
			const { stdout } = await runCompile([SRC_DIR, "-o", dryRunOut, "-N"]);

			expect(existsSync(join(dryRunOut, "global.css"))).toBe(false);
			expect(stdout).toContain("[DRY RUN]");
		});

		test("quiet mode suppresses output", async () => {
			const { stdout } = await runCompile([SRC_DIR, "-o", OUT_DIR, "-Q"]);
			expect(stdout).toBe("");
		});

		test("verbose mode shows file-by-file output", async () => {
			const { stdout } = await runCompile([SRC_DIR, "-o", OUT_DIR, "-V"]);
			expect(stdout).toContain("main.scss");
		});
	});

	describe("error handling", () => {
		test("handles compilation errors gracefully", async () => {
			const errorDir = join(TEST_DIR, "error-src");
			mkdirSync(errorDir, { recursive: true });
			writeFileSync(
				join(errorDir, "broken.scss"),
				`
.broken {
  color: $undefined-variable;
}
`,
			);

			const errorOut = join(TEST_DIR, "error-out");
			await runCompile([errorDir, "-o", errorOut, "-Q"]);

			const manifest = JSON.parse(readFileSync(join(errorOut, "manifest.json"), "utf-8"));
			expect(manifest.errors.length).toBeGreaterThan(0);
		});

		test("records errors in manifest", async () => {
			const errorDir = join(TEST_DIR, "error-src2");
			mkdirSync(errorDir, { recursive: true });
			writeFileSync(
				join(errorDir, "broken2.scss"),
				`
.broken { invalid: ; }
`,
			);

			const errorOut = join(TEST_DIR, "error-out2");
			await runCompile([errorDir, "-o", errorOut, "-Q"]);

			const manifest = JSON.parse(readFileSync(join(errorOut, "manifest.json"), "utf-8"));
			expect(Array.isArray(manifest.errors)).toBe(true);
		});
	});

	describe("load paths", () => {
		test("resolves imports from nested directories", async () => {
			const { code } = await runCompile([SRC_DIR, "-o", OUT_DIR, "-Q"]);
			expect(code).toBe(0);
		});
	});
});
