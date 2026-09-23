import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        include: ["src/**/tests/**/*.test.ts?(x)"],
        exclude: process.env["SLOW"] === "1" ? [] : ["**/*.slow.test.ts?(x)", "**/node_modules/**"],
        pool: "threads",
        environmentMatchGlobs: [["**/*.test.tsx", "jsdom"]],
    },
});
