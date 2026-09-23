import { defineConfig } from "tsup";

export default defineConfig({
    entry: {
        index: "src/index.ts",
        react: "src/plugins/kernel/react/index.tsx",
        testing: "src/testing.ts",
        server: "src/plugins/server/react/server.tsx",
        e2e: "src/plugins/e2e/node/index.ts",
    },
    format: ["esm"],
    dts: true,
    clean: true,
    sourcemap: true,
    treeshake: true,
    target: "es2022",

    external: ["react", "react/jsx-runtime", "react-dom", "react-dom/server", "zod", "node:fs", "node:fs/promises", "node:path", "node:url", "node:net", "node:http", "node:https", "node:os", "node:crypto", "node:child_process", "node:util", "node:timers/promises", "vite", "playwright"],

    platform: "node",
});
