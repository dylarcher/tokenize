export default {
    compileOutDir: "./dist",
    componentPatterns: [
        /\.component\.s?css$/i,
        /\.module\.s?css$/i,
        /_component\.s?css$/i,
        /components\/.*\.s?css$/i,
    ],
    exclude: [
        "../capitalrx-components-2.0/lib/components",
        "../capitalrx-components",
    ],
    ignore: [
        "../capitalrx-components-2.0/lib/components",
        "../tokenize/node_modules",
        "../capitalrx-components",
        "./dist",
        "./bin",
        "./docs",
    ],
    outDir: "./dist",
    outputFormats: ["json", "jsonc", "scss", "sass", "css"],
    scanDir: "../capitalrx-components-2.0",
    spacingBase: 4,
};
