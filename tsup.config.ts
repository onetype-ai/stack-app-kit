import { defineConfig } from "tsup";

export default defineConfig({
    entry: {
        index: "src/index.ts",
        react: "src/plugins/kernel/react/index.tsx",
        testing: "src/testing.ts",
    },
    format: ["esm"],
    dts: true,
    clean: true,
    sourcemap: true,
    treeshake: true,
    target: "es2022",

    // Peers stay peers: one copy of React in an application, never two, or
    // hooks read the wrong dispatcher. `node:fs` is here because /testing runs
    // in a test runner, never in the browser bundle.
    external: ["react", "react/jsx-runtime", "zod", "node:fs", "node:path"],

    // esbuild rewrites `node:fs` to `fs` for a neutral platform. Node reads
    // both, but the prefix is what says /testing belongs in a test runner and
    // never in a browser bundle, so it is put back.
    platform: "node",
});
