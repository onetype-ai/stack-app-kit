import { defineConfig } from "tsup";

export default defineConfig({
    entry: {
        index: "src/index.ts",
        react: "src/plugins/kernel/react/index.tsx",
        testing: "src/testing.ts",
        server: "src/plugins/seo/react/server.tsx",
    },
    format: ["esm"],
    dts: true,
    clean: true,
    sourcemap: true,
    treeshake: true,
    target: "es2022",

    external: ["react", "react/jsx-runtime", "react-dom", "react-dom/server", "zod", "node:fs", "node:fs/promises", "node:path"],

    platform: "node",
});
