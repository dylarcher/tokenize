export default {
    compileOutDir: "./dist/",
    componentPatterns: [
        /\.component\.s?css$/i,
        /\.module\.s?css$/i,
        /_component\.s?css$/i,
        /components\/.*\.s?css$/i,
    ],
    exclude: [],
    ignore: [
        "node_modules",
        "dist",
        ".git*",
        ".tmp",
        "bin",
        "docs",
        ".vscode",
        ".claude",
        ".editorconfig",
        "**/*.md"
    ],
    outDir: "./dist//.tmp",
    outputFormats: ["json", "scss", "css"],
    scanDir: "./tests/mocks/src",
    spacingBase: 4,
};
