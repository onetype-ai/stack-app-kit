import { describe, expect, it, vi } from "vitest";

import { createKernel, definePlugin } from "../api";
import type { KernelOptions } from "../api";

const answering: NonNullable<KernelOptions["http"]> = {
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
        const realtime: KernelOptions["realtime"] = { channel: () => "ws", subscribe };

        const kernel = createKernel({ plugins: [probe], http: answering, realtime });

        await kernel.start();

        const ctx = kernel.context("probe");

        ctx.realtime.subscribe("items", () => {});

        expect(ctx.realtime.channel()).toBe("ws");
        expect(subscribe).toHaveBeenCalledOnce();
    });

    it("answers a reconnect that does nothing when the realtime given has none, and passes it on when it has", async () =>
    {
        const reconnect = vi.fn();
        const without = createKernel({ plugins: [probe], http: answering, realtime: { channel: () => "http", subscribe: () => ({ close: () => {} }) } });
        const withIt = createKernel({ plugins: [probe], http: answering, realtime: { channel: () => "ws", subscribe: () => ({ close: () => {} }), reconnect } });

        await without.start();
        await withIt.start();
        without.context("probe").realtime.reconnect();
        withIt.context("probe").realtime.reconnect();

        expect(reconnect).toHaveBeenCalledOnce();
    });
});

describe("a session that changed", () =>
{
    it("clears the cache, has every guard ask again, then dials the socket, in that order", async () =>
    {
        const steps: string[] = [];
        const kernel = createKernel({
            plugins: [probe],
            http: answering,
            cache: { invalidate: () => {}, clear: () => steps.push("cleared") },
            realtime: { channel: () => "ws", subscribe: () => ({ close: () => {} }), reconnect: () => steps.push("dialled") },
        });
        await kernel.start();
        const ctx = kernel.context("probe");
        ctx.permissions.watch(() => steps.push("guards asked"));

        ctx.session.changed();

        expect(steps).toEqual(["cleared", "guards asked", "dialled"]);
    });

    it("still has guards ask and the socket dial when the application gave no cache", async () =>
    {
        const steps: string[] = [];
        const kernel = createKernel({
            plugins: [probe],
            http: answering,
            realtime: { channel: () => "ws", subscribe: () => ({ close: () => {} }), reconnect: () => steps.push("dialled") },
        });
        await kernel.start();
        const ctx = kernel.context("probe");
        ctx.permissions.watch(() => steps.push("guards asked"));

        ctx.session.changed();

        expect(steps).toEqual(["guards asked", "dialled"]);
    });
});

describe("an upload", () =>
{
    it("reaches the client that can upload", async () =>
    {
        const upload = vi.fn(() => Promise.resolve({ stored: true }));
        const kernel = createKernel({ plugins: [probe], http: { ...answering, upload } });
        await kernel.start();

        const answered = await kernel.context("probe").http.upload("/files", new Blob(["x"]));

        expect(answered).toEqual({ stored: true });
    });

    it("refuses, naming what to give, when the given client cannot upload", async () =>
    {
        const kernel = createKernel({ plugins: [probe], http: answering });
        await kernel.start();

        expect(() => kernel.context("probe").http.upload("/files", new Blob(["x"]))).toThrow("has no upload");
    });
});
