export default {
    compileOutDir: "./dist", // json token files
    componentPatterns: [/(\.s?[ac]ss)$/i],
    exclude: [
        "../capitalrx-components",
        "../capitalrx-components-2.0/lib/**/*.ts",
        "../capitalrx-components-2.0/lib/components",
        "../capitalrx-components-2.0/lib/constants",
        "../capitalrx-components-2.0/lib/hooks",
        "../capitalrx-components-2.0/lib/temp",
        "../capitalrx-components-2.0/lib/testing",
        "../capitalrx-components-2.0/lib/tokens",
        "../capitalrx-components-2.0/lib/utilities",
    ],
    ignore: ["node_modules", "dist", "bin", "docs"],
    outDir: "./dist", // compiled css files
    outputFormats: ["json", "css"],
    scanDir: "../capitalrx-components-2.0", // source of truth
    spacingBase: 4,
};
