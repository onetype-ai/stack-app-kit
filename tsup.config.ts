import { defineConfig } from "tsup";

export default defineConfig({
    entry: {
        index: "src/index.ts",
        react: "src/plugins/kernel/react/index.tsx",
        testing: "src/testing.ts",
        "testing-app": "src/testing/react/app.tsx",
        server: "src/plugins/server/react/server.tsx",
    },
    format: ["esm"],
    dts: true,
    clean: true,
    sourcemap: true,
    treeshake: true,
    target: "es2022",

    external: ["react", "react/jsx-runtime", "react-dom", "react-dom/server", "zod", "node:fs", "node:fs/promises", "node:path", "node:url", "node:net", "node:http", "node:https", "node:os", "node:crypto", "node:child_process", "node:util", "node:timers/promises", "vite", "playwright", "@onetype/stack-app-kit", "@onetype/stack-app-kit/react", "@tanstack/react-query", "@tanstack/react-router", "@testing-library/react", "vitest"],

    platform: "node",
});
