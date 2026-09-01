import { describe, expect, it, vi } from "vitest";

import { createKernel, definePlugin } from "../api";
import type { Client, Realtime } from "../api";

const answering: Client = {
    get: () => Promise.resolve({}),
    post: () => Promise.resolve({}),
    put: () => Promise.resolve({}),
    patch: () => Promise.resolve({}),
    delete: () => Promise.resolve({}),
};

const probe = definePlugin("probe", { version: "1.0.0", describe: "Reaches for what a context carries." });

describe("realtime reaches a plugin", () =>
{
    it("gives a plugin the realtime client it was started with", async () =>
    {
        const subscribe = vi.fn(() => ({ close: () => {} }));
        const realtime: Realtime = { channel: () => "ws", subscribe };

        const kernel = createKernel({ plugins: [probe], http: answering, realtime });

        await kernel.start();

        const ctx = kernel.context("probe");

        ctx.realtime.subscribe("items", () => {});

        expect(ctx.realtime.channel()).toBe("ws");
        expect(subscribe).toHaveBeenCalledOnce();
    });

    it("falls back to an offline client when none is given", async () =>
    {
        const kernel = createKernel({ plugins: [probe], http: answering });

        await kernel.start();

        const ctx = kernel.context("probe");

        expect(ctx.realtime.channel()).toBe("http");
        expect(() => ctx.realtime.subscribe("x", () => {}).close()).not.toThrow();
    });
});

describe("http reaches a plugin", () =>
{
    it("gives a plugin the client it was started with", async () =>
    {
        const get = vi.fn(() => Promise.resolve({ ok: true }));
        const kernel = createKernel({ plugins: [probe], http: { ...answering, get } });

        await kernel.start();

        await expect(kernel.context("probe").http.get("/items")).resolves.toEqual({ ok: true });
        expect(get).toHaveBeenCalledOnce();
    });

    it("refuses a request when none was given, naming what to pass", async () =>
    {
        const kernel = createKernel({ plugins: [probe] });

        await kernel.start();

        expect(() => kernel.context("probe").http.get("/items")).toThrow(/Pass one as `http`/);
    });
});
