import { describe, expect, test } from "vitest";

import { createKernel, definePlugin, KernelFault } from "../api";

import type { Client, Definition, Plugin } from "../api";

function createPlugin(name: string, definition: Partial<Definition> = {}): Plugin
{
    return definePlugin(name, {
        version: "1.0.0",
        describe: `The ${name} plugin.`,
        ...definition,
    });
}

/** A client that answers whatever it was told to, and remembers being asked. */
function recordClient(answer: unknown = { ok: true })
{
    const asked: { method: string; path: string; request?: unknown }[] = [];

    const of = (method: string) => (path: string, request?: unknown) =>
    {
        asked.push({ method, path, ...(request === undefined ? {} : { request }) });

        return Promise.resolve(answer);
    };

    return {
        asked,
        client: {
            get: of("get"),
            post: of("post"),
            put: of("put"),
            patch: of("patch"),
            delete: of("delete"),
        } as Client,
    };
}

describe("ctx.http", () =>
{
    test("is the client the application passed, reaching the path a plugin asked for", async () =>
    {
        const spy = recordClient({ items: [] });
        const kernel = createKernel({ plugins: [createPlugin("demo")], http: spy.client });

        await kernel.start();

        expect(await kernel.context("demo").http.get("/items")).toEqual({ items: [] });
        expect(spy.asked).toEqual([{ method: "get", path: "/items" }]);

        await kernel.stop();
    });

    test("carries the request through untouched, so the kernel adds nothing", async () =>
    {
        const spy = recordClient();
        const kernel = createKernel({ plugins: [createPlugin("demo")], http: spy.client });

        await kernel.start();
        await kernel.context("demo").http.post("/items", { body: { title: "one" } });

        expect(spy.asked[0]).toEqual({ method: "post", path: "/items", request: { body: { title: "one" } } });

        await kernel.stop();
    });

    test("answers every method a client declares", async () =>
    {
        const spy = recordClient();
        const kernel = createKernel({ plugins: [createPlugin("demo")], http: spy.client });

        await kernel.start();

        const http = kernel.context("demo").http;

        await Promise.all([http.get("/a"), http.post("/b"), http.put("/c"), http.patch("/d"), http.delete("/e")]);

        expect(spy.asked.map((one) => one.method).sort())
            .toEqual(["delete", "get", "patch", "post", "put"]);

        await kernel.stop();
    });

    /**
     * A plugin reaching a client nobody passed is a wiring mistake, and the
     * message says which field to pass rather than answering undefined.
     *
     * Thrown where it is called, not through the promise the type promises,
     * so a caller's `.catch` never runs and the stack names the plugin.
     */
    test("and refuses by name when the application passed none", async () =>
    {
        const kernel = createKernel({ plugins: [createPlugin("demo")] });

        await kernel.start();

        expect(() => kernel.context("demo").http.get("/items")).toThrow(KernelFault);
        expect(() => kernel.context("demo").http.get("/items")).toThrow(/ctx\.http/);

        await kernel.stop();
    });

    test("is the same client for every plugin, so two do not open two", async () =>
    {
        const spy = recordClient();
        const kernel = createKernel({ plugins: [createPlugin("one"), createPlugin("two")], http: spy.client });

        await kernel.start();

        expect(kernel.context("one").http).toBe(kernel.context("two").http);

        await kernel.stop();
    });
});

describe("ctx.cache", () =>
{
    test("passes the key through to whatever the application gave", async () =>
    {
        const dropped: unknown[][] = [];
        const kernel = createKernel({
            plugins: [createPlugin("demo")],
            cache: { invalidate: (key) => dropped.push([...key]) },
        });

        await kernel.start();

        kernel.context("demo").cache.invalidate(["demo", "items"]);

        expect(dropped).toEqual([["demo", "items"]]);

        await kernel.stop();
    });

    test("and refuses by name when the application gave none", async () =>
    {
        const kernel = createKernel({ plugins: [createPlugin("demo")] });

        await kernel.start();

        expect(() => kernel.context("demo").cache.invalidate(["a"])).toThrow(/ctx\.cache/);

        await kernel.stop();
    });
});

describe("ctx.realtime", () =>
{
    test("subscribes on the channel a plugin named, and hands back what closes it", async () =>
    {
        const opened: string[] = [];
        let closed = false;

        const kernel = createKernel({
            plugins: [createPlugin("demo")],
            realtime: {
                channel: () => "ws",
                subscribe: (channel) =>
                {
                    opened.push(channel);

                    return { close: () => { closed = true; } };
                },
            },
        });

        await kernel.start();

        const spy = kernel.context("demo").realtime.subscribe("demo.items", () => {});

        expect(opened).toEqual(["demo.items"]);

        spy.close();

        expect(closed).toBe(true);

        await kernel.stop();
    });

    test("delivers what the server pushed to the plugin that asked", async () =>
    {
        let tell: ((message: unknown) => void) | undefined;

        const kernel = createKernel({
            plugins: [createPlugin("demo")],
            realtime: {
                channel: () => "ws",
                subscribe: (_channel, told) =>
                {
                    tell = told;

                    return { close: () => {} };
                },
            },
        });

        await kernel.start();

        const heard: unknown[] = [];

        kernel.context("demo").realtime.subscribe("demo.items", (message) => heard.push(message));
        tell?.({ id: "one" });

        expect(heard).toEqual([{ id: "one" }]);

        await kernel.stop();
    });

    test("but says http rather than refusing when the application gave none", async () =>
    {
        const kernel = createKernel({ plugins: [createPlugin("demo")] });

        await kernel.start();

        const spy = kernel.context("demo").realtime;

        expect(spy.channel()).toBe("http");
        expect(() => spy.subscribe("x", () => {}).close()).not.toThrow();

        await kernel.stop();
    });
});
