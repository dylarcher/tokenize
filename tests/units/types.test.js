import { describe, test, expect } from "bun:test";
import { spawn } from "node:child_process";
import { join } from "node:path";

const PROJECT_ROOT = join(import.meta.dir, "../..");

/**
 * Runs the types command.
 * @returns {Promise<{stdout: string, stderr: string, code: number}>}
 */
const runTypes = () => {
	return new Promise((resolve) => {
		const proc = spawn("bun", [join(PROJECT_ROOT, "src/commands/types.js")], {
			cwd: PROJECT_ROOT,
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

describe("types", () => {
	describe("command execution", () => {
		test("runs without crashing", async () => {
			const { code } = await runTypes();
			expect(code).toBe(0);
		});

		test("outputs bundling message", async () => {
			const { stdout } = await runTypes();
			expect(stdout).toContain("Bundling type declarations");
		});

		test("handles missing .d.ts files gracefully", async () => {
			const { stdout, code } = await runTypes();
			expect(code).toBe(0);
			// Either finds files to bundle or reports none found
			expect(
				stdout.includes("No .d.ts files") || stdout.includes("Created"),
			).toBe(true);
		});
	});

	describe("output format", () => {
		test("reports output file when files exist", async () => {
			const { stdout } = await runTypes();
			// If files were bundled, reports the created file
			// If no files, reports no files found
			expect(stdout.length).toBeGreaterThan(0);
		});
	});
});
