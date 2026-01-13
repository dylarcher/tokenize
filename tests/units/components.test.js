import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdirSync, writeFileSync, rmSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { OUTPUTS_DIR } from "../helpers/testUtils.js";

const TEST_DIR = join(OUTPUTS_DIR, ".tmp", "components-test");
const OUT_DIR = join(TEST_DIR, "dist");

/**
 * Runs the components generator.
 * @param {string[]} args - Command arguments
 * @returns {Promise<{stdout: string, stderr: string, code: number}>}
 */
const runComponents = (args = []) => {
	return new Promise((resolve) => {
		const proc = spawn(
			"bun",
			["src/generators/components.js", ...args],
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

describe("components", () => {
	beforeAll(() => {
		rmSync(TEST_DIR, { recursive: true, force: true });
		mkdirSync(OUT_DIR, { recursive: true });

		const semantic = {
			surface: {
				default: "{color.neutral.100}",
				secondary: "{color.neutral.200}",
				tertiary: "{color.neutral.300}",
				inverse: "{color.neutral.900}",
			},
			text: {
				primary: "{color.neutral.900}",
				secondary: "{color.neutral.700}",
				tertiary: "{color.neutral.500}",
				inverse: "{color.neutral.100}",
				disabled: "{color.neutral.400}",
				link: "{color.blue.500}",
			},
			border: {
				default: "{color.neutral.300}",
				subtle: "{color.neutral.200}",
				strong: "{color.neutral.500}",
				focus: "{color.blue.500}",
			},
			interactive: {
				primary: {
					default: "{color.blue.500}",
					hover: "{color.blue.600}",
					active: "{color.blue.700}",
					disabled: "{color.neutral.400}",
				},
			},
			feedback: {
				success: { bg: "{color.green.100}", border: "{color.green.300}", text: "{color.green.900}" },
				error: { bg: "{color.red.100}", border: "{color.red.300}", text: "{color.red.900}" },
				warning: { bg: "{color.yellow.100}", border: "{color.yellow.300}", text: "{color.yellow.900}" },
				info: { bg: "{color.blue.100}", border: "{color.blue.300}", text: "{color.blue.900}" },
			},
			typography: {
				body: { fontFamily: "{typography.fontFamily.primary}", fontSize: "{typography.fontSize.base}" },
				heading: { fontWeight: "{typography.fontWeight.bold}" },
				caption: { fontSize: "{typography.fontSize.sm}" },
			},
			spacing: {
				inset: { xs: "{spacing.1}", sm: "{spacing.2}", md: "{spacing.4}", lg: "{spacing.6}", xl: "{spacing.8}" },
				stack: { xs: "{spacing.1}", sm: "{spacing.2}", md: "{spacing.4}", lg: "{spacing.6}" },
				inline: { xs: "{spacing.1}", sm: "{spacing.2}", md: "{spacing.4}", lg: "{spacing.6}" },
			},
			elevation: { none: "none", low: "{shadow.sm}", medium: "{shadow.md}", high: "{shadow.lg}" },
			radius: { none: "0", small: "{border.radius.sm}", medium: "{border.radius.md}", large: "{border.radius.lg}", pill: "{border.radius.full}" },
			layer: { base: "{zIndex.base}", dropdown: "{zIndex.dropdown}", modal: "{zIndex.modal}", tooltip: "{zIndex.tooltip}" },
		};

		writeFileSync(join(OUT_DIR, "semantic.json"), JSON.stringify(semantic, null, 2));
	});

	afterAll(() => {
		rmSync(TEST_DIR, { recursive: true, force: true });
	});

	describe("button component", () => {
		test("generates primary button tokens", async () => {
			await runComponents(["-o", OUT_DIR, "-Q"]);

			const components = JSON.parse(readFileSync(join(OUT_DIR, "components.json"), "utf-8"));
			expect(components.button.primary).toBeDefined();
			expect(components.button.primary.background).toBe("{interactive.primary.default}");
			expect(components.button.primary.backgroundHover).toBe("{interactive.primary.hover}");
			expect(components.button.primary.text).toBe("{text.inverse}");
		});

		test("generates secondary button tokens", async () => {
			await runComponents(["-o", OUT_DIR, "-Q"]);

			const components = JSON.parse(readFileSync(join(OUT_DIR, "components.json"), "utf-8"));
			expect(components.button.secondary).toBeDefined();
			expect(components.button.secondary.background).toBe("transparent");
			expect(components.button.secondary.border).toBe("{border.default}");
		});

		test("generates ghost button tokens", async () => {
			await runComponents(["-o", OUT_DIR, "-Q"]);

			const components = JSON.parse(readFileSync(join(OUT_DIR, "components.json"), "utf-8"));
			expect(components.button.ghost).toBeDefined();
			expect(components.button.ghost.background).toBe("transparent");
			expect(components.button.ghost.border).toBe("transparent");
		});
	});

	describe("input component", () => {
		test("generates input tokens", async () => {
			await runComponents(["-o", OUT_DIR, "-Q"]);

			const components = JSON.parse(readFileSync(join(OUT_DIR, "components.json"), "utf-8"));
			expect(components.input).toBeDefined();
			expect(components.input.background).toBe("{surface.default}");
			expect(components.input.borderFocus).toBe("{border.focus}");
			expect(components.input.borderError).toBe("{feedback.error.border}");
		});
	});

	describe("card component", () => {
		test("generates card tokens", async () => {
			await runComponents(["-o", OUT_DIR, "-Q"]);

			const components = JSON.parse(readFileSync(join(OUT_DIR, "components.json"), "utf-8"));
			expect(components.card).toBeDefined();
			expect(components.card.background).toBe("{surface.default}");
			expect(components.card.shadow).toBe("{elevation.low}");
			expect(components.card.borderRadius).toBe("{radius.large}");
		});
	});

	describe("modal component", () => {
		test("generates modal tokens", async () => {
			await runComponents(["-o", OUT_DIR, "-Q"]);

			const components = JSON.parse(readFileSync(join(OUT_DIR, "components.json"), "utf-8"));
			expect(components.modal).toBeDefined();
			expect(components.modal.overlay).toBe("rgba(0, 0, 0, 0.5)");
			expect(components.modal.zIndex).toBe("{layer.modal}");
			expect(components.modal.shadow).toBe("{elevation.high}");
		});
	});

	describe("tooltip component", () => {
		test("generates tooltip tokens", async () => {
			await runComponents(["-o", OUT_DIR, "-Q"]);

			const components = JSON.parse(readFileSync(join(OUT_DIR, "components.json"), "utf-8"));
			expect(components.tooltip).toBeDefined();
			expect(components.tooltip.background).toBe("{surface.inverse}");
			expect(components.tooltip.text).toBe("{text.inverse}");
			expect(components.tooltip.zIndex).toBe("{layer.tooltip}");
		});
	});

	describe("badge component", () => {
		test("generates badge default variant", async () => {
			await runComponents(["-o", OUT_DIR, "-Q"]);

			const components = JSON.parse(readFileSync(join(OUT_DIR, "components.json"), "utf-8"));
			expect(components.badge.default).toBeDefined();
			expect(components.badge.default.background).toBe("{surface.tertiary}");
		});

		test("generates badge feedback variants", async () => {
			await runComponents(["-o", OUT_DIR, "-Q"]);

			const components = JSON.parse(readFileSync(join(OUT_DIR, "components.json"), "utf-8"));
			expect(components.badge.success).toBeDefined();
			expect(components.badge.success.background).toBe("{feedback.success.bg}");
			expect(components.badge.error).toBeDefined();
			expect(components.badge.warning).toBeDefined();
			expect(components.badge.info).toBeDefined();
		});

		test("badge has pill border radius", async () => {
			await runComponents(["-o", OUT_DIR, "-Q"]);

			const components = JSON.parse(readFileSync(join(OUT_DIR, "components.json"), "utf-8"));
			expect(components.badge.borderRadius).toBe("{radius.pill}");
		});
	});

	describe("link component", () => {
		test("generates link tokens", async () => {
			await runComponents(["-o", OUT_DIR, "-Q"]);

			const components = JSON.parse(readFileSync(join(OUT_DIR, "components.json"), "utf-8"));
			expect(components.link).toBeDefined();
			expect(components.link.text).toBe("{text.link}");
			expect(components.link.textHover).toBe("{interactive.primary.hover}");
			expect(components.link.underline).toBe("none");
			expect(components.link.underlineHover).toBe("underline");
		});
	});

	describe("avatar component", () => {
		test("generates avatar tokens", async () => {
			await runComponents(["-o", OUT_DIR, "-Q"]);

			const components = JSON.parse(readFileSync(join(OUT_DIR, "components.json"), "utf-8"));
			expect(components.avatar).toBeDefined();
			expect(components.avatar.borderRadius).toBe("{radius.pill}");
			expect(components.avatar.sizes).toBeDefined();
			expect(components.avatar.sizes.sm).toBe("24px");
			expect(components.avatar.sizes.lg).toBe("48px");
		});
	});

	describe("dropdown component", () => {
		test("generates dropdown tokens", async () => {
			await runComponents(["-o", OUT_DIR, "-Q"]);

			const components = JSON.parse(readFileSync(join(OUT_DIR, "components.json"), "utf-8"));
			expect(components.dropdown).toBeDefined();
			expect(components.dropdown.zIndex).toBe("{layer.dropdown}");
			expect(components.dropdown.shadow).toBe("{elevation.medium}");
		});

		test("generates dropdown item tokens", async () => {
			await runComponents(["-o", OUT_DIR, "-Q"]);

			const components = JSON.parse(readFileSync(join(OUT_DIR, "components.json"), "utf-8"));
			expect(components.dropdown.item).toBeDefined();
			expect(components.dropdown.item.background).toBe("transparent");
			expect(components.dropdown.item.backgroundHover).toBe("{surface.secondary}");
		});
	});

	describe("tabs component", () => {
		test("generates tabs tokens", async () => {
			await runComponents(["-o", OUT_DIR, "-Q"]);

			const components = JSON.parse(readFileSync(join(OUT_DIR, "components.json"), "utf-8"));
			expect(components.tabs).toBeDefined();
			expect(components.tabs.border).toBe("{border.subtle}");
		});

		test("generates tab item tokens", async () => {
			await runComponents(["-o", OUT_DIR, "-Q"]);

			const components = JSON.parse(readFileSync(join(OUT_DIR, "components.json"), "utf-8"));
			expect(components.tabs.tab).toBeDefined();
			expect(components.tabs.tab.textActive).toBe("{interactive.primary.default}");
			expect(components.tabs.tab.borderActive).toBe("{interactive.primary.default}");
		});

		test("generates tab panel tokens", async () => {
			await runComponents(["-o", OUT_DIR, "-Q"]);

			const components = JSON.parse(readFileSync(join(OUT_DIR, "components.json"), "utf-8"));
			expect(components.tabs.panel).toBeDefined();
			expect(components.tabs.panel.padding).toBe("{spacing.inset.lg}");
		});
	});

	describe("alert component", () => {
		test("generates alert feedback variants", async () => {
			await runComponents(["-o", OUT_DIR, "-Q"]);

			const components = JSON.parse(readFileSync(join(OUT_DIR, "components.json"), "utf-8"));
			expect(components.alert).toBeDefined();
			expect(components.alert.success).toBeDefined();
			expect(components.alert.success.background).toBe("{feedback.success.bg}");
			expect(components.alert.success.border).toBe("{feedback.success.border}");
			expect(components.alert.success.text).toBe("{feedback.success.text}");
		});

		test("alert has all feedback variants", async () => {
			await runComponents(["-o", OUT_DIR, "-Q"]);

			const components = JSON.parse(readFileSync(join(OUT_DIR, "components.json"), "utf-8"));
			expect(components.alert.error).toBeDefined();
			expect(components.alert.warning).toBeDefined();
			expect(components.alert.info).toBeDefined();
		});
	});

	describe("output formats", () => {
		test("generates JSON output", async () => {
			await runComponents(["-o", OUT_DIR, "-Q"]);
			expect(existsSync(join(OUT_DIR, "components.json"))).toBe(true);
		});

		test("generates SCSS output with semantic references", async () => {
			await runComponents(["-o", OUT_DIR, "-Q"]);
			expect(existsSync(join(OUT_DIR, "_components.scss"))).toBe(true);

			const scss = readFileSync(join(OUT_DIR, "_components.scss"), "utf-8");
			expect(scss).toContain('@use "semantic" as s');
			expect(scss).toContain("s.$");
		});

		test("generates CSS output with var() references", async () => {
			await runComponents(["-o", OUT_DIR, "-Q"]);
			expect(existsSync(join(OUT_DIR, "components.css"))).toBe(true);

			const css = readFileSync(join(OUT_DIR, "components.css"), "utf-8");
			expect(css).toContain(":root {");
			expect(css).toContain("var(--");
		});
	});

	describe("all 11 components", () => {
		test("generates all component tokens", async () => {
			await runComponents(["-o", OUT_DIR, "-Q"]);

			const components = JSON.parse(readFileSync(join(OUT_DIR, "components.json"), "utf-8"));
			const componentNames = Object.keys(components);
			expect(componentNames).toContain("button");
			expect(componentNames).toContain("input");
			expect(componentNames).toContain("card");
			expect(componentNames).toContain("modal");
			expect(componentNames).toContain("tooltip");
			expect(componentNames).toContain("badge");
			expect(componentNames).toContain("link");
			expect(componentNames).toContain("avatar");
			expect(componentNames).toContain("dropdown");
			expect(componentNames).toContain("tabs");
			expect(componentNames).toContain("alert");
			expect(componentNames.length).toBe(11);
		});
	});

	describe("CLI flags", () => {
		test("quiet mode suppresses output", async () => {
			const { stdout } = await runComponents(["-o", OUT_DIR, "-Q"]);
			expect(stdout).toBe("");
		});

		test("verbose mode shows component details", async () => {
			const { stdout } = await runComponents(["-o", OUT_DIR, "-V"]);
			expect(stdout).toContain("Component details");
			expect(stdout).toContain("button:");
		});

		test("normal mode shows summary", async () => {
			const { stdout } = await runComponents(["-o", OUT_DIR]);
			expect(stdout).toContain("Generated component tokens");
			expect(stdout).toContain("Components: 11");
		});
	});

	describe("error handling", () => {
		test("exits with error if semantic.json missing", async () => {
			const emptyDir = join(TEST_DIR, "empty");
			mkdirSync(emptyDir, { recursive: true });

			const { stderr, code } = await runComponents(["-o", emptyDir]);
			expect(code).toBe(1);
			expect(stderr).toContain("semantic");
		});
	});
});
