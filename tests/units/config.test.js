import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { writeFileSync, rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import {
	loadConfiguration,
	getOutputDirectory,
	getExcludePatterns,
	hasFlag,
	getFlagValue,
} from "../../src/helperUtils/config.js";
import { OUTPUTS_DIR } from "../helpers/testUtils.js";

const TEST_DIR = join(OUTPUTS_DIR, ".tmp", "config-test");

describe("config", () => {
	beforeAll(() => {
		rmSync(TEST_DIR, { recursive: true, force: true });
		mkdirSync(TEST_DIR, { recursive: true });

		writeFileSync(
			join(TEST_DIR, "tokenize.config.js"),
			`export default { scanDir: './src', outDir: './dist', exclude: ['*.md'] };`,
		);

		writeFileSync(
			join(TEST_DIR, "custom.config.js"),
			`export default { scanDir: './custom', outDir: './output' };`,
		);
	});

	afterAll(() => {
		rmSync(TEST_DIR, { recursive: true, force: true });
	});

	describe("loadConfiguration", () => {
		test("loads default config file when present", async () => {
			const originalCwd = process.cwd();
			process.chdir(TEST_DIR);
			try {
				const config = await loadConfiguration([]);
				expect(config.scanDir).toBe("./src");
				expect(config.outDir).toBe("./dist");
			} finally {
				process.chdir(originalCwd);
			}
		});

		test("loads custom config via -c flag", async () => {
			const configPath = join(TEST_DIR, "custom.config.js");
			const config = await loadConfiguration(["node", "script.js", "-c", configPath]);
			expect(config.scanDir).toBe("./custom");
		});

		test("loads custom config via -C flag", async () => {
			const configPath = join(TEST_DIR, "custom.config.js");
			const config = await loadConfiguration(["node", "script.js", "-C", configPath]);
			expect(config.scanDir).toBe("./custom");
		});

		test("loads custom config via --config flag", async () => {
			const configPath = join(TEST_DIR, "custom.config.js");
			const config = await loadConfiguration(["node", "script.js", "--config", configPath]);
			expect(config.scanDir).toBe("./custom");
		});

		test("returns empty object when config file not found", async () => {
			const config = await loadConfiguration([
				"node",
				"script.js",
				"-c",
				"/non/existent/config.js",
			]);
			expect(config).toEqual({});
		});

		test("returns empty object when no config specified and default not found", async () => {
			const originalCwd = process.cwd();
			process.chdir("/tmp");
			try {
				const config = await loadConfiguration([]);
				expect(config).toEqual({});
			} finally {
				process.chdir(originalCwd);
			}
		});

		test("uses process.argv by default", async () => {
			const config = await loadConfiguration();
			expect(typeof config).toBe("object");
		});

		test("returns empty object when config file has invalid syntax", async () => {
			const invalidConfigPath = join(TEST_DIR, "invalid.config.js");
			writeFileSync(invalidConfigPath, "export default { invalid syntax here");
			const config = await loadConfiguration(["node", "script.js", "-c", invalidConfigPath]);
			expect(config).toEqual({});
		});
	});

	describe("getOutputDirectory", () => {
		test("returns value from -o flag", () => {
			const result = getOutputDirectory(["node", "script.js", "-o", "./output"], {});
			expect(result).toBe("./output");
		});

		test("returns value from -O flag", () => {
			const result = getOutputDirectory(["node", "script.js", "-O", "./output"], {});
			expect(result).toBe("./output");
		});

		test("returns value from --out flag", () => {
			const result = getOutputDirectory(["node", "script.js", "--out", "./output"], {});
			expect(result).toBe("./output");
		});

		test("returns value from --dist flag", () => {
			const result = getOutputDirectory(["node", "script.js", "--dist", "./dist"], {});
			expect(result).toBe("./dist");
		});

		test("returns config.outDir when no flag provided", () => {
			const result = getOutputDirectory(["node", "script.js"], { outDir: "./from-config" });
			expect(result).toBe("./from-config");
		});

		test("returns default when no flag and no config", () => {
			const result = getOutputDirectory(["node", "script.js"], {});
			expect(result).toBe("./tokens");
		});

		test("returns custom default when provided", () => {
			const result = getOutputDirectory(["node", "script.js"], {}, "./custom-default");
			expect(result).toBe("./custom-default");
		});

		test("prefers CLI flag over config", () => {
			const result = getOutputDirectory(["node", "script.js", "-o", "./cli-output"], {
				outDir: "./config-output",
			});
			expect(result).toBe("./cli-output");
		});
	});

	describe("getExcludePatterns", () => {
		test("extracts pattern from -e flag", () => {
			const result = getExcludePatterns(["node", "script.js", "-e", "*.md"], {});
			expect(result).toContain("*.md");
		});

		test("extracts pattern from -X flag", () => {
			const result = getExcludePatterns(["node", "script.js", "-X", "*.test.js"], {});
			expect(result).toContain("*.test.js");
		});

		test("extracts pattern from --exclude flag", () => {
			const result = getExcludePatterns(["node", "script.js", "--exclude", "dist"], {});
			expect(result).toContain("dist");
		});

		test("extracts multiple patterns", () => {
			const result = getExcludePatterns(
				["node", "script.js", "-e", "*.md", "-e", "*.txt", "-X", "dist"],
				{},
			);
			expect(result).toContain("*.md");
			expect(result).toContain("*.txt");
			expect(result).toContain("dist");
		});

		test("includes config exclude patterns", () => {
			const result = getExcludePatterns(["node", "script.js"], { exclude: ["*.spec.js"] });
			expect(result).toContain("*.spec.js");
		});

		test("merges CLI and config patterns", () => {
			const result = getExcludePatterns(["node", "script.js", "-e", "*.md"], {
				exclude: ["*.spec.js"],
			});
			expect(result).toContain("*.md");
			expect(result).toContain("*.spec.js");
		});

		test("handles empty config exclude", () => {
			const result = getExcludePatterns(["node", "script.js", "-e", "*.md"], {});
			expect(result).toContain("*.md");
			expect(result.length).toBe(1);
		});

		test("accepts initial patterns array", () => {
			const result = getExcludePatterns(["node", "script.js"], {}, ["initial"]);
			expect(result).toContain("initial");
		});

		test("skips flag without value", () => {
			const result = getExcludePatterns(["node", "script.js", "-e"], {});
			expect(result.length).toBe(0);
		});
	});

	describe("hasFlag", () => {
		test("returns true when flag is present", () => {
			expect(hasFlag(["--verbose", "--help"], ["--verbose"])).toBe(true);
		});

		test("returns true when any flag matches", () => {
			expect(hasFlag(["--verbose"], ["-v", "--verbose"])).toBe(true);
		});

		test("returns false when flag is absent", () => {
			expect(hasFlag(["--help"], ["--verbose"])).toBe(false);
		});

		test("returns false for empty args", () => {
			expect(hasFlag([], ["--verbose"])).toBe(false);
		});

		test("returns false for empty flags", () => {
			expect(hasFlag(["--verbose"], [])).toBe(false);
		});

		test("handles short flags", () => {
			expect(hasFlag(["-v", "-h"], ["-v"])).toBe(true);
		});

		test("handles mixed short and long flags", () => {
			expect(hasFlag(["-v", "--help"], ["-h", "--help"])).toBe(true);
		});
	});

	describe("getFlagValue", () => {
		test("returns value after flag", () => {
			expect(getFlagValue(["--output", "./dist"], ["--output"])).toBe("./dist");
		});

		test("returns value for short flag", () => {
			expect(getFlagValue(["-o", "./dist"], ["-o"])).toBe("./dist");
		});

		test("returns value for any matching flag", () => {
			expect(getFlagValue(["-o", "./dist"], ["-o", "--output"])).toBe("./dist");
		});

		test("returns undefined when flag not found", () => {
			expect(getFlagValue(["--help"], ["--output"])).toBe(undefined);
		});

		test("returns default value when flag not found", () => {
			expect(getFlagValue(["--help"], ["--output"], "./default")).toBe("./default");
		});

		test("returns default when value looks like another flag", () => {
			expect(getFlagValue(["--output", "--help"], ["--output"], "./default")).toBe(
				"./default",
			);
		});

		test("returns undefined when no value after flag", () => {
			expect(getFlagValue(["--output"], ["--output"])).toBe(undefined);
		});

		test("handles flag at end of args", () => {
			expect(getFlagValue(["--help", "--output"], ["--output"], "default")).toBe("default");
		});

		test("returns correct value with multiple flags", () => {
			expect(getFlagValue(["--verbose", "--output", "./dist", "--help"], ["--output"])).toBe(
				"./dist",
			);
		});
	});
});
