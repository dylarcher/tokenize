import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdirSync, writeFileSync, rmSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { OUTPUTS_DIR } from "../helpers/testUtils.js";

const TEST_DIR = join(OUTPUTS_DIR, ".tmp", "cli-test");

/**
 * Runs the CLI command.
 * @param {string[]} args - Command arguments
 * @returns {Promise<{stdout: string, stderr: string, code: number}>}
 */
const runCli = (args = []) => {
	return new Promise((resolve) => {
		const proc = spawn(
			"bun",
			["src/cli.js", ...args],
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

describe("cli", () => {
	beforeAll(() => {
		rmSync(TEST_DIR, { recursive: true, force: true });
		mkdirSync(TEST_DIR, { recursive: true });
	});

	afterAll(() => {
		rmSync(TEST_DIR, { recursive: true, force: true });
	});

	describe("help and version", () => {
		test("shows help with no arguments", async () => {
			const { stdout, code } = await runCli([]);
			expect(code).toBe(0);
			expect(stdout).toContain("Tokenize CLI");
			expect(stdout).toContain("Commands:");
		});

		test("shows help with -h flag", async () => {
			const { stdout, code } = await runCli(["-h"]);
			expect(code).toBe(0);
			expect(stdout).toContain("Commands:");
		});

		test("shows help with --help flag", async () => {
			const { stdout, code } = await runCli(["--help"]);
			expect(code).toBe(0);
			expect(stdout).toContain("Commands:");
		});

		test("shows help with help command", async () => {
			const { stdout, code } = await runCli(["help"]);
			expect(code).toBe(0);
			expect(stdout).toContain("Commands:");
		});

		test("shows version with -v flag", async () => {
			const { stdout, code } = await runCli(["-v"]);
			expect(code).toBe(0);
			expect(stdout).toMatch(/tokenize v\d+\.\d+\.\d+/);
		});

		test("shows version with --version flag", async () => {
			const { stdout, code } = await runCli(["--version"]);
			expect(code).toBe(0);
			expect(stdout).toMatch(/tokenize v\d+\.\d+\.\d+/);
		});

		test("shows version with version command", async () => {
			const { stdout, code } = await runCli(["version"]);
			expect(code).toBe(0);
			expect(stdout).toMatch(/tokenize v/);
		});
	});

	describe("command routing", () => {
		test("routes to scan command", async () => {
			const { code } = await runCli(["scan", "--help"]);
			expect(code).toBe(0);
		});

		test("routes to compile command", async () => {
			const { code } = await runCli(["compile", "--help"]);
			expect(code).toBe(0);
		});

		test("routes to tokens command", async () => {
			const { stdout, code } = await runCli(["tokens", "--help"]);
			expect(code).toBe(0);
			expect(stdout).toContain("primitives");
		});

		test("routes audit alias to scan", async () => {
			const { code } = await runCli(["audit", "--help"]);
			expect(code).toBe(0);
		});

		test("routes build alias to compile", async () => {
			const { code } = await runCli(["build", "--help"]);
			expect(code).toBe(0);
		});
	});

	describe("unknown commands", () => {
		test("shows error for unknown command", async () => {
			const { stderr, code } = await runCli(["unknown-command"]);
			expect(code).toBe(1);
			expect(stderr).toContain("Unknown command");
		});
	});

	describe("init command", () => {
		const CLI_PATH = join(import.meta.dir, "../../src/cli.js");

		test("creates config file", async () => {
			const initDir = join(TEST_DIR, "init-test");
			mkdirSync(initDir, { recursive: true });

			const { code, stdout } = await new Promise((resolve) => {
				const proc = spawn("bun", [CLI_PATH, "init"], {
					cwd: initDir,
				});
				let stdout = "";
				proc.stdout.on("data", (data) => {
					stdout += data.toString();
				});
				proc.on("close", (code) => resolve({ stdout, code: code ?? 0 }));
			});

			expect(code).toBe(0);
			expect(existsSync(join(initDir, "tokenize.config.js"))).toBe(true);
		});

		test("errors if config already exists", async () => {
			const existsDir = join(TEST_DIR, "exists-test");
			mkdirSync(existsDir, { recursive: true });
			writeFileSync(join(existsDir, "tokenize.config.js"), "export default {}");

			const { code, stderr } = await new Promise((resolve) => {
				const proc = spawn("bun", [CLI_PATH, "init"], {
					cwd: existsDir,
				});
				let stderr = "";
				proc.stderr.on("data", (data) => {
					stderr += data.toString();
				});
				proc.on("close", (code) => resolve({ stderr, code: code ?? 0 }));
			});

			expect(code).toBe(1);
			expect(stderr).toContain("already exists");
		});
	});

	describe("stats command", () => {
		test("shows token statistics", async () => {
			const statsDir = join(TEST_DIR, "stats-test");
			mkdirSync(statsDir, { recursive: true });

			writeFileSync(
				join(statsDir, "primitives.json"),
				JSON.stringify({ color: { red: "#ff0000", blue: "#0000ff" }, spacing: { 1: "4px" } }),
			);
			writeFileSync(
				join(statsDir, "semantic.json"),
				JSON.stringify({ surface: { default: "{color.neutral.100}" } }),
			);

			const { stdout, code } = await runCli(["stats", "-o", statsDir]);
			expect(code).toBe(0);
			expect(stdout).toContain("Token Statistics");
			expect(stdout).toContain("primitives");
		});
	});

	describe("all pipeline command", () => {
		test("runs full pipeline with --dry-run", async () => {
			const pipelineDir = join(TEST_DIR, "pipeline-test");
			mkdirSync(pipelineDir, { recursive: true });
			writeFileSync(
				join(pipelineDir, "test.scss"),
				`body { color: #ff0000; font-size: 16px; }`,
			);

			const outDir = join(TEST_DIR, "pipeline-out");

			const { stdout, code } = await runCli(["all", pipelineDir, "-o", outDir, "-N"]);
			expect(stdout).toContain("[DRY RUN]");
		});
	});

	describe("flag handling", () => {
		test("passes --help flag to subcommands", async () => {
			const { stdout, code } = await runCli(["scan", "--help"]);
			expect(code).toBe(0);
			expect(stdout.length).toBeGreaterThan(0);
		});

		test("passes -V verbose flag to subcommands", async () => {
			const { stdout } = await runCli(["tokens", "--help", "-V"]);
			expect(stdout).toContain("verbose");
		});

		test("passes -o output flag to subcommands", async () => {
			const customDir = join(TEST_DIR, "custom-output");
			const { stdout } = await runCli(["tokens", "--help", "-o", customDir]);
			expect(stdout).toContain("-o");
		});
	});

	describe("help content", () => {
		test("help includes all main commands", async () => {
			const { stdout } = await runCli(["--help"]);
			expect(stdout).toContain("build");
			expect(stdout).toContain("compile");
			expect(stdout).toContain("scan");
			expect(stdout).toContain("audit");
			expect(stdout).toContain("tokens");
			expect(stdout).toContain("types");
			expect(stdout).toContain("init");
			expect(stdout).toContain("debug");
			expect(stdout).toContain("stats");
			expect(stdout).toContain("all");
		});

		test("help includes token layers", async () => {
			const { stdout } = await runCli(["--help"]);
			expect(stdout).toContain("primitives");
			expect(stdout).toContain("semantic");
			expect(stdout).toContain("components");
		});

		test("help includes common options", async () => {
			const { stdout } = await runCli(["--help"]);
			expect(stdout).toContain("--config");
			expect(stdout).toContain("--out");
			expect(stdout).toContain("--exclude");
			expect(stdout).toContain("--verbose");
			expect(stdout).toContain("--quiet");
			expect(stdout).toContain("--dry-run");
		});

		test("help includes examples", async () => {
			const { stdout } = await runCli(["--help"]);
			expect(stdout).toContain("Examples:");
			expect(stdout).toContain("tokenize");
		});
	});
});
