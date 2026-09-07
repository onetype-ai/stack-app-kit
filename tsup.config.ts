import { defineConfig } from "tsup";

export default defineConfig({
    entry: {
        index: "src/index.ts",
        react: "src/plugins/kernel/react/index.tsx",
        testing: "src/testing.ts",
        packing: "src/packing.ts",
    },
    format: ["esm"],
    dts: true,
    clean: true,
    sourcemap: true,
    treeshake: true,
    target: "es2022",

    external: ["react", "react/jsx-runtime", "zod", "node:fs", "node:path"],

    platform: "node",
});
