import { describe, expect, test } from "vitest";
import { z } from "zod";

import { createKernel, definePlugin } from "../api";

import type { Definition, Plugin } from "../api";

function made(name: string, held: Partial<Definition> = {}): Plugin
{
    return definePlugin(name, {
        version: "1.0.0",
        describe: `The ${name} plugin.`,
        ...held,
    });
}

const announcing = (name: string) => made(name, {
    emits: {
        [`${name}.happened`]: {
            describe: "Something did.",
            schema: z.object({ id: z.string() }),
        },
    },
});

describe("hearing an event while a view is on screen", () =>
{
    test("delivers what was emitted", async () =>
    {
        const kernel = createKernel({ plugins: [announcing("mail"), made("badge", { dependsOn: ["mail"] })] });

        await kernel.start();

        const heard: unknown[] = [];

        kernel.context("badge").events.on("mail.happened", (payload) => heard.push(payload));
        kernel.context("mail").events.emit("mail.happened", { id: "one" });

        expect(heard).toEqual([{ id: "one" }]);

        await kernel.stop();
    });

    /**
     * A view leaves the screen, and its ear leaves with it. Without this a
     * plugin writes its own subscribers, which is a second event system.
     */
    test("and stops when what it answered is called", async () =>
    {
        const kernel = createKernel({ plugins: [announcing("mail"), made("badge", { dependsOn: ["mail"] })] });

        await kernel.start();

        const heard: unknown[] = [];
        const stop = kernel.context("badge").events.on("mail.happened", (payload) => heard.push(payload));

        kernel.context("mail").events.emit("mail.happened", { id: "one" });
        stop();
        kernel.context("mail").events.emit("mail.happened", { id: "two" });

        expect(heard).toEqual([{ id: "one" }]);

        await kernel.stop();
    });

    test("hears every ear, and stopping one leaves the others", async () =>
    {
        const kernel = createKernel({ plugins: [announcing("mail"), made("badge", { dependsOn: ["mail"] })] });

        await kernel.start();

        const first: unknown[] = [];
        const second: unknown[] = [];
        const held = kernel.context("badge");

        const stop = held.events.on("mail.happened", (payload) => first.push(payload));
        held.events.on("mail.happened", (payload) => second.push(payload));

        stop();
        kernel.context("mail").events.emit("mail.happened", { id: "one" });

        expect(first).toEqual([]);
        expect(second).toEqual([{ id: "one" }]);

        await kernel.stop();
    });

    test("still refuses a payload the owner's schema does not take", async () =>
    {
        const kernel = createKernel({ plugins: [announcing("mail"), made("badge", { dependsOn: ["mail"] })] });

        await kernel.start();

        const heard: unknown[] = [];

        kernel.context("badge").events.on("mail.happened", (payload) => heard.push(payload));

        expect(() => kernel.context("mail").events.emit("mail.happened", { id: 7 })).toThrow();
        expect(heard).toEqual([]);

        await kernel.stop();
    });

    test("and stopping twice is not an error, so a view may clean up either way", async () =>
    {
        const kernel = createKernel({ plugins: [announcing("mail"), made("badge", { dependsOn: ["mail"] })] });

        await kernel.start();

        const stop = kernel.context("badge").events.on("mail.happened", () => {});

        stop();

        expect(stop).not.toThrow();

        await kernel.stop();
    });
});
