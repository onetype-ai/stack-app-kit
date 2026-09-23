import { afterEach, describe, expect, test } from "vitest";
import { z } from "zod";

import * as main from "../../index";
import { createKernel, definePlugin, start } from "../../index";
import type { Plugin, StartedApp } from "../../index";
import { configureTestKernels, resetTestKernels, withDependencies } from "../../testing";

let app: StartedApp | undefined;

afterEach(async () =>
{
    await app?.stop();
    app = undefined;
    resetTestKernels();
});

function needing(name: string, dependsOn: string[] = []): Plugin
{
    return definePlugin(name, { version: "1.0.0", describe: `Needs ${dependsOn.join(", ") || "nothing"}.`, dependsOn });
}

const shelf: Readonly<Record<string, Plugin>> = {
    frame: needing("frame"),
    items: needing("items", ["frame"]),
};

function configureFromShelf(asked: string[] = []): void
{
    configureTestKernels({
        resolve: (name) =>
        {
            asked.push(name);

            const plugin = shelf[name];

            return plugin === undefined ? undefined : { plugin };
        },
    });
}

async function boot(plugins: Plugin[], config?: Record<string, unknown>): Promise<StartedApp>
{
    app = await start({ plugins, transport: { baseUrl: "/api" }, ...(config !== undefined && { config }) });

    return app;
}

function namesIn(running: StartedApp): string[]
{
    return running.kernel.plugins().map((plugin) => plugin.name).filter((name) => name !== "transport");
}

describe("start, never configured", () =>
{
    test("boots exactly what it was given", async () =>
    {
        const running = await boot([needing("board", ["items"]), shelf.items as Plugin, shelf.frame as Plugin]);

        expect(namesIn(running).sort()).toEqual(["board", "frame", "items"]);
    });

    test("refuses a dependency it was not given, rather than finding it", async () =>
    {
        await expect(boot([needing("board", ["items"])])).rejects.toThrow("UNKNOWN_DEPENDENCY");
    });
});

describe("start, configured with where plugins come from", () =>
{
    test("adds what the plugin under test depends on, and what that depends on, before it", async () =>
    {
        configureFromShelf();

        const running = await boot([needing("board", ["items"])]);

        expect(namesIn(running)).toEqual(["frame", "items", "board"]);
    });

    test("keeps a stand-in the test passed, and follows only what the stand-in depends on", async () =>
    {
        configureFromShelf();
        const items = needing("items");

        const running = await boot([needing("board", ["items"]), items]);

        expect(running.kernel.plugins().find((plugin) => plugin.name === "items")).toBe(items);
        expect(namesIn(running)).not.toContain("frame");
    });

    test("still refuses a dependency nobody provides, naming it", async () =>
    {
        configureFromShelf();

        await expect(boot([needing("board", ["nowhere"])])).rejects.toThrow("nowhere");
    });

    test("asks where a plugin comes from once, however many tests need it", async () =>
    {
        const asked: string[] = [];
        configureFromShelf(asked);

        await boot([needing("board", ["items"])]);
        await app?.stop();
        await boot([needing("list", ["items"])]);

        expect(asked).toEqual(["items", "frame"]);
    });

    test("gives config only to a plugin it added, and never over what the test gave", async () =>
    {
        const heard: Record<string, unknown> = {};
        const configured = (name: string): Plugin => definePlugin(name, {
            version: "1.0.0",
            describe: "Keeps the title it was configured with.",
            config: z.object({ title: z.string() }),
            setup: (ctx) =>
            {
                heard[name] = ctx.config.title;
            },
        });
        configureTestKernels({
            resolve: (name) => ({ plugin: configured(name), config: { title: `${name} from the fixture` } }),
        });

        await boot([needing("board", ["items", "tags", "notes"]), configured("notes")], {
            tags: { title: "tags from the test" },
            notes: { title: "notes from the test" },
        });

        expect(heard).toEqual({ items: "items from the fixture", tags: "tags from the test", notes: "notes from the test" });
    });

    test("boots exactly what it is given again once reset", async () =>
    {
        configureFromShelf();
        resetTestKernels();

        await expect(boot([needing("board", ["items"])])).rejects.toThrow("UNKNOWN_DEPENDENCY");
    });
});

describe("where configuring can come from", () =>
{
    test("only the testing entry, so nothing a browser bundle imports can hand start extra plugins", () =>
    {
        expect(Object.keys(main)).not.toContain("configureTestKernels");
        expect(Object.keys(main)).not.toContain("withDependencies");
    });
});

describe("withDependencies", () =>
{
    test("closes a list the same way, for a kernel built with createKernel", async () =>
    {
        configureFromShelf();

        const plugins = await withDependencies([needing("board", ["items"])]);
        const kernel = createKernel({ plugins });
        await kernel.start();

        expect(plugins.map((plugin) => plugin.name)).toEqual(["frame", "items", "board"]);
        expect(kernel.started()).toBe(true);
    });
});
