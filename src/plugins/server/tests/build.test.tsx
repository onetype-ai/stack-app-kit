import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createElement } from "react";
import { afterEach, describe, expect, test } from "vitest";

import { definePlugin } from "../../kernel/api";
import type { RouterOptions } from "../../router/api";
import { start } from "../../mount/api";
import { SeoFault } from "../../seo/api";
import { prerenderApp, prerenderOnBuild } from "../react/server";

const folders: string[] = [];

afterEach(async () =>
{
    for (const made of folders.splice(0))
    {
        await rm(made, { recursive: true, force: true });
    }
});

async function folder(): Promise<string>
{
    const made = await mkdtemp(join(tmpdir(), "kit-prerender-"));

    folders.push(made);

    return made;
}

function standingRouter(visited: string[]): RouterOptions
{
    return {
        createRootRoute: () => ({ addChildren: function addChildren() { return this; } }),
        createRoute: () => ({}),
        createRouter: () =>
        {
            let at = "";

            return {
                update: ({ history }: { history: unknown }) =>
                {
                    at = String(history);
                },
                load: async () =>
                {
                    visited.push(at);
                },
            };
        },
    };
}

function starting(visited: string[], history: ((path: string) => unknown) | null = (path) => `memory:${path}`)
{
    return () => start({
        plugins: [definePlugin("pages", {
            version: "1.0.0",
            describe: "Public pages.",
            routes: [
                { path: "/", title: "Home", component: () => null, render: "prerender" },
                { path: "/about", title: "About", component: () => null, render: "prerender" },
            ],
        })],
        transport: { baseUrl: "/api" },
        router: {
            building: standingRouter(visited),
            missing: () => null,
            outlet: () => null,
            wrap: (_frame, outlet) => outlet,
            landing: () => () => null,
            guard: () => () => null,
            ...(history !== null && { history }),
        },
    });
}

describe("prerendering an app", () =>
{
    test("stands the router at each path, loads it, and renders the one tree", async () =>
    {
        const visited: string[] = [];
        const outDir = await folder();
        const run = prerenderApp({ start: starting(visited), tree: () => createElement("p", null, "the tree") });

        const pages = await run({ template: "<html><head><!--kit-head--></head><body><!--kit-app--></body></html>", origin: "https://site.example", outDir });

        expect(visited).toEqual(["memory:/", "memory:/about"]);
        expect(pages.map((page) => page.path)).toEqual(["/", "/about"]);
        expect(await readFile(join(outDir, "about", "index.html"), "utf8")).toContain("<p>the tree</p>");
    });

    test("refuses to visit a path with a router given no history, naming what to give", async () =>
    {
        const app = await starting([], null)();

        await expect(app.visit("/")).rejects.toMatchObject({ code: "INVALID_CONFIG", message: expect.stringContaining("history: (path) => createMemoryHistory") });
        await app.stop();
    });
});

describe("prerendering on build", () =>
{
    const resolved = (overrides: Record<string, unknown> = {}) => ({
        root: "/site", mode: "production", configFile: false as const, command: "build", build: { outDir: "dist", ssr: undefined as unknown }, ...overrides,
    });

    test("stops a production build whose origin is missing or not absolute", () =>
    {
        expect(() => prerenderOnBuild({ entry: "src/prerender.tsx", origin: undefined }).configResolved(resolved())).toThrow(SeoFault);
        expect(() => prerenderOnBuild({ entry: "src/prerender.tsx", origin: "shop.example" }).configResolved(resolved())).toThrow(SeoFault);
    });

    test("leaves development, a dev server and its own server build alone", () =>
    {
        expect(() => prerenderOnBuild({ entry: "e", origin: undefined }).configResolved(resolved({ mode: "development" }))).not.toThrow();
        expect(() => prerenderOnBuild({ entry: "e", origin: undefined }).configResolved(resolved({ command: "serve" }))).not.toThrow();
        expect(() => prerenderOnBuild({ entry: "e", origin: undefined }).configResolved(resolved({ build: { outDir: "dist", ssr: "e" } }))).not.toThrow();
    });

    test("builds the entry for the server once, runs it with the built index.html, and cleans up", async () =>
    {
        const root = await folder();
        const plugin = join(process.cwd(), "src/plugins/server/react/server.tsx");

        await writeFile(join(root, "index.html"), "<html><head><!--kit-head--></head><body><!--kit-app--></body></html>");
        await writeFile(join(root, "entry.mjs"), `import { writeFile } from "node:fs/promises";
globalThis.prerenderRuns = (globalThis.prerenderRuns ?? 0) + 1;
export default async (output) => { await writeFile(output.outDir + "/proof.json", JSON.stringify({ origin: output.origin, hasMarker: output.template.includes("kit-app"), runs: globalThis.prerenderRuns })); };
`);
        await writeFile(join(root, "vite.config.mjs"), `import { prerenderOnBuild } from ${JSON.stringify(plugin)};
export default { plugins: [prerenderOnBuild({ entry: "entry.mjs", origin: "https://site.example" })], logLevel: "silent" };
`);
        const vite = await import("vite");

        await vite.build({ root, configFile: join(root, "vite.config.mjs"), logLevel: "silent" });

        const proof = JSON.parse(await readFile(join(root, "dist", "proof.json"), "utf8")) as { origin: string; hasMarker: boolean; runs: number };

        expect(proof).toEqual({ origin: "https://site.example", hasMarker: true, runs: 1 });
        expect(await readdir(join(root, "dist"))).not.toContain(".prerender");
    }, 30_000);
});
