import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";
import { z } from "zod";

import { createKernel, definePlugin } from "../api";
import { KernelProvider, Slot } from "../react/index";

import type { ReactNode } from "react";

afterEach(cleanup);

const shell = definePlugin("shell", {
    version: "1.0.0",
    describe: "Frames every page.",
    permissions: { "shell.admin": { describe: "Sees admin links." } },
    slots: { "shell.links": { describe: "Links in the side menu.", schema: z.object({}) } },
});

const link = (label: string) => function Link(): ReactNode
{
    return <a href="#">{label}</a>;
};

const docs = definePlugin("docs", {
    version: "1.0.0",
    describe: "Documentation.",
    dependsOn: ["shell"],
    contributes: [{ slot: "shell.links", order: 1, render: link("Docs") }],
});

const labels = () => screen.queryAllByRole("link").map((each) => each.textContent);

describe("a slot filled while the app runs", () =>
{
    test("renders a contribution set at run time beside the declared ones, and drops it when stopped", async () =>
    {
        const kernel = createKernel({ plugins: [shell, docs, definePlugin("help", { version: "1.0.0", describe: "Help.", dependsOn: ["shell"] })], permissions: { granted: () => [] } });
        await kernel.start();
        render(<KernelProvider kernel={kernel}><Slot name="shell.links" /></KernelProvider>);

        let stop = (): void => {};
        act(() =>
        {
            stop = kernel.context("help").registry("shell.links").set({ order: 0, render: link("Help") });
        });
        const whileSet = labels();
        act(() =>
        {
            stop();
        });

        expect(whileSet).toEqual(["Help", "Docs"]);
        expect(labels()).toEqual(["Docs"]);
    });

    test("keeps ties in the order they arrived, and hides what the viewer lacks the permission for", async () =>
    {
        const kernel = createKernel({ plugins: [shell, docs], permissions: { granted: () => [] } });
        await kernel.start();
        const links = kernel.context("docs").registry("shell.links");
        links.set({ order: 1, render: link("Second") });
        links.set({ order: 1, render: link("Admin"), requires: ["shell.admin"] });

        render(<KernelProvider kernel={kernel}><Slot name="shell.links" /></KernelProvider>);

        expect(labels()).toEqual(["Docs", "Second"]);
    });

    test("refuses a contribution without a component, and a registry named like a slot", async () =>
    {
        const kernel = createKernel({ plugins: [shell, docs] });
        await kernel.start();
        const clash = createKernel({ plugins: [definePlugin("shell", {
            version: "1.0.0",
            describe: "Clashes.",
            slots: { "shell.links": { describe: "Links.", schema: z.object({}) } },
            registries: { "shell.links": { describe: "Links again.", entry: z.object({ id: z.string() }), key: "id" } },
        })] });

        expect(() => kernel.context("docs").registry("shell.links").set({ order: 2 })).toThrow(/render must be a component/);
        await expect(clash.start()).rejects.toThrow(/Slot or registry "shell.links" is already declared by "shell"/);
    });
});
