import { defineConfig } from "vitest/config";

export default defineConfig({
    // openApp reaches the kit through its package name, so one kernel context serves it and the page; here that is the source
    resolve: {
        alias: [
            { find: /^@onetype\/stack-app-kit\/react$/, replacement: new URL("./src/plugins/kernel/react/index.tsx", import.meta.url).pathname },
            { find: /^@onetype\/stack-app-kit$/, replacement: new URL("./src/index.ts", import.meta.url).pathname },
        ],
    },
    test: {
        include: ["src/**/tests/**/*.test.ts?(x)"],
        exclude: process.env["SLOW"] === "1" ? [] : ["**/*.slow.test.ts?(x)", "**/node_modules/**"],
        pool: "threads",
        environmentMatchGlobs: [["**/*.test.tsx", "jsdom"]],
    },
});
