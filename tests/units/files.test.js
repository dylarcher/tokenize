import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdirSync, writeFileSync, rmSync, existsSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import {
	convertGlobPatternToRegularExpression,
	matchesExcludePattern,
	defaultComponentPatterns,
	isComponentFile,
	isPartialFile,
	walkDirectory,
	getComponentName,
	ensureDirectory,
	getFileModTime,
} from "../../src/helperUtils/files.js";
import { OUTPUTS_DIR } from "../helpers/testUtils.js";

const TEST_DIR = join(OUTPUTS_DIR, ".tmp", "files-test");

describe("files", () => {
	beforeAll(() => {
		rmSync(TEST_DIR, { recursive: true, force: true });
		mkdirSync(TEST_DIR, { recursive: true });

		mkdirSync(join(TEST_DIR, "components"), { recursive: true });
		mkdirSync(join(TEST_DIR, "styles"), { recursive: true });
		mkdirSync(join(TEST_DIR, "node_modules"), { recursive: true });

		writeFileSync(join(TEST_DIR, "main.scss"), "body { color: red; }");
		writeFileSync(join(TEST_DIR, "_variables.scss"), "$color: blue;");
		writeFileSync(join(TEST_DIR, "styles", "global.css"), ".global {}");
		writeFileSync(join(TEST_DIR, "components", "button.scss"), ".btn {}");
		writeFileSync(join(TEST_DIR, "components", "button.component.scss"), ".btn {}");
		writeFileSync(join(TEST_DIR, "node_modules", "lib.css"), ".lib {}");
	});

	afterAll(() => {
		rmSync(TEST_DIR, { recursive: true, force: true });
	});

	describe("convertGlobPatternToRegularExpression", () => {
		test("converts simple wildcard pattern", () => {
			const regex = convertGlobPatternToRegularExpression("*.scss");
			expect(regex.test("main.scss")).toBe(true);
			expect(regex.test("styles.scss")).toBe(true);
			expect(regex.test("main.css")).toBe(false);
		});

		test("converts double wildcard (globstar) pattern", () => {
			const regex = convertGlobPatternToRegularExpression("**/*.scss");
			expect(regex.test("src/main.scss")).toBe(true);
			expect(regex.test("src/components/button.scss")).toBe(true);
		});

		test("converts question mark pattern", () => {
			const regex = convertGlobPatternToRegularExpression("file?.scss");
			expect(regex.test("file1.scss")).toBe(true);
			expect(regex.test("fileA.scss")).toBe(true);
			expect(regex.test("file12.scss")).toBe(false);
		});

		test("escapes special regex characters", () => {
			const regex = convertGlobPatternToRegularExpression("file.test.scss");
			expect(regex.test("file.test.scss")).toBe(true);
			expect(regex.test("filextest.scss")).toBe(false);
		});

		test("handles directory patterns", () => {
			const regex = convertGlobPatternToRegularExpression("components/*");
			expect(regex.test("components/button")).toBe(true);
			expect(regex.test("components/card")).toBe(true);
		});

		test("matches path with leading slash", () => {
			const regex = convertGlobPatternToRegularExpression("*.scss");
			expect(regex.test("/src/main.scss")).toBe(true);
		});

		test("matches path with trailing slash", () => {
			const regex = convertGlobPatternToRegularExpression("node_modules");
			expect(regex.test("node_modules/")).toBe(true);
		});
	});

	describe("matchesExcludePattern", () => {
		test("matches single pattern", () => {
			expect(matchesExcludePattern("node_modules/lib.js", ["node_modules"])).toBe(true);
		});

		test("matches glob pattern in array", () => {
			expect(matchesExcludePattern("src/test.spec.js", ["*.spec.js"])).toBe(true);
		});

		test("returns false when no match", () => {
			expect(matchesExcludePattern("src/main.js", ["*.spec.js"])).toBe(false);
		});

		test("normalizes Windows path separators", () => {
			expect(matchesExcludePattern("src\\components\\button.js", ["components"])).toBe(true);
		});

		test("matches multiple patterns", () => {
			const patterns = ["node_modules", "dist", "*.test.js"];
			expect(matchesExcludePattern("dist/bundle.js", patterns)).toBe(true);
			expect(matchesExcludePattern("src/app.test.js", patterns)).toBe(true);
			expect(matchesExcludePattern("src/app.js", patterns)).toBe(false);
		});

		test("handles empty patterns array", () => {
			expect(matchesExcludePattern("any/path.js", [])).toBe(false);
		});
	});

	describe("defaultComponentPatterns", () => {
		test("is an array of RegExp", () => {
			expect(Array.isArray(defaultComponentPatterns)).toBe(true);
			expect(defaultComponentPatterns.every((p) => p instanceof RegExp)).toBe(true);
		});

		test("contains expected number of patterns", () => {
			expect(defaultComponentPatterns.length).toBe(5);
		});

		test("matches .component.scss files", () => {
			const pattern = defaultComponentPatterns[0];
			expect(pattern.test("button.component.scss")).toBe(true);
			expect(pattern.test("button.component.css")).toBe(true);
		});

		test("matches .module.scss files", () => {
			const pattern = defaultComponentPatterns[1];
			expect(pattern.test("button.module.scss")).toBe(true);
		});

		test("matches _component.scss files", () => {
			const pattern = defaultComponentPatterns[2];
			expect(pattern.test("_component.scss")).toBe(true);
		});

		test("matches components folder nested files", () => {
			const pattern = defaultComponentPatterns[3];
			expect(pattern.test("components/button/styles.scss")).toBe(true);
		});

		test("matches components folder direct files", () => {
			const pattern = defaultComponentPatterns[4];
			expect(pattern.test("components/button.scss")).toBe(true);
		});
	});

	describe("isComponentFile", () => {
		test("identifies .component.scss files", () => {
			expect(isComponentFile("button.component.scss")).toBe(true);
		});

		test("identifies .module.scss files", () => {
			expect(isComponentFile("button.module.scss")).toBe(true);
		});

		test("identifies files in components folder", () => {
			expect(isComponentFile("components/button.scss")).toBe(true);
		});

		test("returns false for regular scss files", () => {
			expect(isComponentFile("styles/main.scss")).toBe(false);
		});

		test("returns false for partial files not in components", () => {
			expect(isComponentFile("_variables.scss")).toBe(false);
		});

		test("accepts custom patterns", () => {
			const customPatterns = [/\.custom\.scss$/];
			expect(isComponentFile("button.custom.scss", customPatterns)).toBe(true);
			expect(isComponentFile("button.component.scss", customPatterns)).toBe(false);
		});

		test("is case insensitive for extension", () => {
			expect(isComponentFile("button.component.SCSS")).toBe(true);
		});
	});

	describe("isPartialFile", () => {
		test("identifies underscore-prefixed files as partials", () => {
			expect(isPartialFile("_variables.scss")).toBe(true);
		});

		test("identifies nested partials", () => {
			expect(isPartialFile("styles/_mixins.scss")).toBe(true);
		});

		test("returns false for non-partial files", () => {
			expect(isPartialFile("main.scss")).toBe(false);
		});

		test("returns false for files with underscore not at start", () => {
			expect(isPartialFile("my_styles.scss")).toBe(false);
		});

		test("handles deep nested paths", () => {
			expect(isPartialFile("src/styles/abstracts/_functions.scss")).toBe(true);
		});
	});

	describe("walkDirectory", () => {
		test("finds scss files by default", () => {
			const files = walkDirectory(TEST_DIR);
			const scssFiles = files.filter((f) => f.endsWith(".scss"));
			expect(scssFiles.length).toBeGreaterThanOrEqual(3);
		});

		test("finds css files by default", () => {
			const files = walkDirectory(TEST_DIR);
			const cssFiles = files.filter((f) => f.endsWith(".css"));
			expect(cssFiles.length).toBeGreaterThanOrEqual(1);
		});

		test("ignores node_modules by default", () => {
			const files = walkDirectory(TEST_DIR);
			const hasNodeModules = files.some((f) => f.includes("node_modules"));
			expect(hasNodeModules).toBe(false);
		});

		test("filters by custom extensions", () => {
			const files = walkDirectory(TEST_DIR, { extensions: [".css"] });
			expect(files.every((f) => f.endsWith(".css"))).toBe(true);
		});

		test("respects custom ignore list", () => {
			const files = walkDirectory(TEST_DIR, { ignore: ["styles"] });
			const hasStyles = files.some((f) => f.includes("/styles/"));
			expect(hasStyles).toBe(false);
		});

		test("excludes patterns", () => {
			const files = walkDirectory(TEST_DIR, { excludePatterns: ["**/components/**"] });
			const hasComponents = files.some((f) => f.includes("components"));
			expect(hasComponents).toBe(false);
		});

		test("includes partials by default", () => {
			const files = walkDirectory(TEST_DIR);
			const hasPartials = files.some((f) => f.includes("_variables"));
			expect(hasPartials).toBe(true);
		});

		test("can exclude partials", () => {
			const files = walkDirectory(TEST_DIR, { includePartials: false });
			const hasPartials = files.some((f) => f.includes("_variables"));
			expect(hasPartials).toBe(false);
		});

		test("returns empty array for non-existent directory", () => {
			const files = walkDirectory("/non/existent/path");
			expect(files).toEqual([]);
		});

		test("handles empty directory", () => {
			const emptyDir = join(TEST_DIR, "empty");
			mkdirSync(emptyDir, { recursive: true });
			const files = walkDirectory(emptyDir);
			expect(files).toEqual([]);
		});

		test("handles broken symlinks gracefully", () => {
			const symlinkDir = join(TEST_DIR, "symlink-test");
			mkdirSync(symlinkDir, { recursive: true });
			writeFileSync(join(symlinkDir, "real.scss"), "body {}");
			try {
				symlinkSync("/non/existent/target.scss", join(symlinkDir, "broken.scss"));
			} catch {
				// Symlink creation may fail on some systems
			}
			const files = walkDirectory(symlinkDir);
			// Should find the real file and skip the broken symlink
			expect(files.some((f) => f.includes("real.scss"))).toBe(true);
		});

		test("handles file passed as directory", () => {
			const filePath = join(TEST_DIR, "main.scss");
			const files = walkDirectory(filePath);
			expect(files).toEqual([]);
		});
	});

	describe("getComponentName", () => {
		test("converts kebab-case to PascalCase", () => {
			expect(getComponentName("user-profile.scss")).toBe("UserProfile");
		});

		test("converts snake_case to PascalCase", () => {
			expect(getComponentName("user_profile.scss")).toBe("UserProfile");
		});

		test("removes partial prefix and converts", () => {
			expect(getComponentName("_button.scss")).toBe("Button");
		});

		test("removes .component suffix", () => {
			expect(getComponentName("button.component.scss")).toBe("Button");
		});

		test("removes .module suffix", () => {
			expect(getComponentName("button.module.scss")).toBe("Button");
		});

		test("removes .styles suffix", () => {
			expect(getComponentName("button.styles.scss")).toBe("Button");
		});

		test("handles css extension", () => {
			expect(getComponentName("button.css")).toBe("Button");
		});

		test("handles nested paths", () => {
			expect(getComponentName("components/user-profile.scss")).toBe("UserProfile");
		});

		test("handles single word names", () => {
			expect(getComponentName("button.scss")).toBe("Button");
		});

		test("handles multiple hyphens", () => {
			expect(getComponentName("my-long-component-name.scss")).toBe("MyLongComponentName");
		});
	});

	describe("ensureDirectory", () => {
		const testEnsureDir = join(TEST_DIR, "ensure-test", "nested", "dir");

		afterAll(() => {
			rmSync(join(TEST_DIR, "ensure-test"), { recursive: true, force: true });
		});

		test("creates directory if it does not exist", () => {
			expect(existsSync(testEnsureDir)).toBe(false);
			ensureDirectory(testEnsureDir);
			expect(existsSync(testEnsureDir)).toBe(true);
		});

		test("does not throw if directory already exists", () => {
			expect(() => ensureDirectory(testEnsureDir)).not.toThrow();
		});
	});

	describe("getFileModTime", () => {
		test("returns modification time for existing file", () => {
			const testFile = join(TEST_DIR, "main.scss");
			const modTime = getFileModTime(testFile);
			expect(typeof modTime).toBe("number");
			expect(modTime).toBeGreaterThan(0);
		});

		test("returns null for non-existent file", () => {
			const modTime = getFileModTime("/non/existent/file.scss");
			expect(modTime).toBe(null);
		});

		test("returns recent timestamp for newly created file", () => {
			const newFile = join(TEST_DIR, "new-file.scss");
			writeFileSync(newFile, "test");
			const modTime = getFileModTime(newFile);
			const now = Date.now();
			expect(modTime).toBeGreaterThan(now - 5000);
			expect(modTime).toBeLessThanOrEqual(now);
		});
	});
});
