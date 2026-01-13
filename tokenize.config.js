export default {
    // Source directories
    scanDir: "../capitalrx-components-2.0",

    // Separate path configurations for global vs component styles
    globalPaths: [
        "../capitalrx-components-2.0/scss",
        "../capitalrx-components-2.0/lib/typography",
    ],
    componentPaths: [
        "../capitalrx-components-2.0/lib/general",
        "../capitalrx-components-2.0/lib/forms",
        "../capitalrx-components-2.0/lib/layout",
    ],

    // Output directories
    outDir: "./dist",
    compileOutDir: "./dist",

    // Reference tokens for diff comparison
    refsDir: "../capitalrx-components-2.0/lib/tokens/_refs",

    // Optional manifest for explicit component definitions (merged with auto-detection)
    manifest: null, // e.g., "./components.manifest.json"

    // Patterns to identify component files
    componentPatterns: [/(\.s?[ac]ss)$/i, /(\.module\.css)$/i],

    // Patterns to exclude from scanning
    exclude: [
        "../capitalrx-components",
        "../capitalrx-components-2.0/lib/**/*.ts",
        "../capitalrx-components-2.0/lib/**/*.tsx",
        "../capitalrx-components-2.0/lib/components",
        "../capitalrx-components-2.0/lib/constants",
        "../capitalrx-components-2.0/lib/hooks",
        "../capitalrx-components-2.0/lib/temp",
        "../capitalrx-components-2.0/lib/testing",
        "../capitalrx-components-2.0/lib/tokens",
        "../capitalrx-components-2.0/lib/utilities",
    ],

    // Directories to always ignore
    ignore: ["node_modules", "dist", "bin", "docs", ".git", "build", "compiled"],

    // Output formats
    outputFormats: ["json", "css"],

    // Base unit for spacing calculations (in pixels)
    spacingBase: 4,

    // DTCG output format (use $value/$type instead of value/type)
    dtcgFormat: true,
};
