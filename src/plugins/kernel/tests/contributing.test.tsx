import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { z } from "zod";

import { createKernel, definePlugin } from "../api";
import { KernelProvider, Slot } from "../react";

afterEach(cleanup);

const shell = definePlugin("shell", {
    version: "1.0.0",
    describe: "The frame. Names no plugin, and never learns one.",
    slots: { "shell.nav": { describe: "A place in the sidebar.", schema: z.object({}) } },
});

const billing = definePlugin("billing", {
    version: "1.0.0",
    describe: "Puts itself in the sidebar.",
    contributes: [{ slot: "shell.nav", render: () => <p>billing</p> }],
});

describe("a plugin that fills another's slot", () =>
{
    test("needs no dependency on it: a contribution hands over a component, never reaches for one", async () =>
    {
        const kernel = createKernel({ plugins: [shell, billing] });

        await kernel.start();

        expect(kernel.started()).toBe(true);
    });

    test("twice, and React is given a key of its own for each", async () =>
    {
        const twice = definePlugin("twice", {
            version: "1.0.0",
            describe: "Fills one slot twice.",
            contributes: [
                { slot: "shell.nav", render: () => <p>first</p> },
                { slot: "shell.nav", render: () => <p>second</p> },
            ],
        });

        const kernel = createKernel({ plugins: [shell, twice] });

        await kernel.start();

        const said: string[] = [];
        const watching = vi.spyOn(console, "error").mockImplementation((...given: unknown[]) => said.push(String(given[0])));

        render(<KernelProvider kernel={kernel}><Slot name="shell.nav" payload={{}} /></KernelProvider>);

        watching.mockRestore();

        expect(said.filter((one) => one.includes("same key"))).toEqual([]);
        expect(screen.getByText("first")).toBeTruthy();
        expect(screen.getByText("second")).toBeTruthy();
    });

    test("so a shell may frame the plugins that fill it, which is the whole point of a slot", async () =>
    {
        const framing = definePlugin("shell", {
            version: "1.0.0",
            describe: "The frame, reaching billing for something of its own.",
            dependsOn: ["billing"],
            slots: { "shell.nav": { describe: "A place.", schema: z.object({}) } },
        });

        const kernel = createKernel({ plugins: [framing, billing] });

        await kernel.start();

        render(<KernelProvider kernel={kernel}><Slot name="shell.nav" /></KernelProvider>);

        expect(screen.getByText("billing")).toBeDefined();
    });

    test("and renders, so the absent dependency costs nothing at run time", async () =>
    {
        const kernel = createKernel({ plugins: [shell, billing] });

        await kernel.start();

        render(<KernelProvider kernel={kernel}><Slot name="shell.nav" /></KernelProvider>);

        expect(screen.getByText("billing")).toBeDefined();
    });
});

describe("what a contribution is still held to", () =>
{
    test("a slot nobody opened is refused, naming it", async () =>
    {
        const lost = definePlugin("billing", {
            version: "1.0.0",
            describe: "Fills a place that is not there.",
            contributes: [{ slot: "nowhere.aside", render: () => null }],
        });

        const kernel = createKernel({ plugins: [lost] });

        await expect(kernel.start()).rejects.toThrow(/nowhere.aside/);
    });

    test("a permission nobody declares is refused, naming it", async () =>
    {
        const guarded = definePlugin("billing", {
            version: "1.0.0",
            describe: "Fills it behind a permission nobody grants.",
            contributes: [{ slot: "shell.nav", requires: ["nowhere.read"], render: () => null }],
        });

        const kernel = createKernel({ plugins: [shell, guarded] });

        await expect(kernel.start()).rejects.toThrow(/nowhere.read/);
    });

    test("and a payload the slot never promised is refused at render", async () =>
    {
        const strict = definePlugin("shell", {
            version: "1.0.0",
            describe: "Opens a place that wants an id.",
            slots: { "shell.nav": { describe: "A place.", schema: z.object({ id: z.uuid() }) } },
        });

        const kernel = createKernel({ plugins: [strict, billing] });

        await kernel.start();

        const opened = kernel.slot("shell.nav", { id: "not-a-uuid" });

        expect(opened.problem).toBeDefined();
        expect(opened.contributions).toEqual([]);
    });
});

describe("hearing and joining, which are not the same as filling", () =>
{
    test("a listener still names the plugin whose event it parses", async () =>
    {
        const owner = definePlugin("shell", {
            version: "1.0.0",
            describe: "Announces.",
            emits: { "shell.opened": { describe: "It opened.", schema: z.object({}) } },
        });

        const hearing = definePlugin("billing", {
            version: "1.0.0",
            describe: "Hears without saying so.",
            listens: { "shell.opened": { describe: "Hears it.", handle: () => undefined } },
        });

        const kernel = createKernel({ plugins: [owner, hearing] });

        await expect(kernel.start()).rejects.toThrow(/does not depend on/);
    });

    test("and a participant still names the plugin whose hook it answers", async () =>
    {
        const owner = definePlugin("shell", {
            version: "1.0.0",
            describe: "Asks before it closes.",
            hooks: { "shell.before-close": { describe: "Refuse to close.", schema: z.object({}) } },
        });

        const joining = definePlugin("billing", {
            version: "1.0.0",
            describe: "Refuses without saying so.",
            participates: { "shell.before-close": { describe: "Refuses.", handle: () => undefined } },
        });

        const kernel = createKernel({ plugins: [owner, joining] });

        await expect(kernel.start()).rejects.toThrow(/does not depend on/);
    });
});
