import { cleanup, render, screen } from "@testing-library/react";
import { StrictMode, useState } from "react";
import { afterEach, describe, expect, test } from "vitest";
import { z } from "zod";

import { createKernel, definePlugin } from "../api";
import { KernelProvider, useEvent } from "../react/index";

import type { Definition, Kernel, Plugin } from "../api";
import type { ReactNode } from "react";

afterEach(cleanup);

function createPlugin(name: string, definition: Partial<Definition> = {}): Plugin
{
    return definePlugin(name, { version: "1.0.0", describe: `The ${name} plugin.`, ...definition });
}

const mail = createPlugin("mail", {
    emits: {
        "mail.arrived": { describe: "One came in.", schema: z.object({ id: z.string() }) },
    },
});

async function startKernel(): Promise<Kernel>
{
    const kernel = createKernel({ plugins: [mail, createPlugin("badge", { dependsOn: ["mail"] })] });

    await kernel.start();

    return kernel;
}

function Counter(): ReactNode
{
    const [seen, setSeen] = useState<string[]>([]);

    useEvent("badge", "mail.arrived", (payload) =>
    {
        setSeen((before) => [...before, (payload as { id: string }).id]);
    });

    return <p>{seen.join(",") || "nothing"}</p>;
}

describe("a component hearing an event", () =>
{
    test("shows what arrived while it was on screen", async () =>
    {
        const kernel = await startKernel();

        render(<KernelProvider kernel={kernel}><Counter /></KernelProvider>);

        expect(screen.getByText("nothing")).toBeDefined();

        kernel.context("mail").events.emit("mail.arrived", { id: "one" });

        expect(await screen.findByText("one")).toBeDefined();

        await kernel.stop();
    });

    /**
     * The bug this prevents: a component that unmounts and leaves its ear
     * behind updates state on something that is gone.
     */
    test("stops hearing once it leaves", async () =>
    {
        const kernel = await startKernel();
        const view = render(<KernelProvider kernel={kernel}><Counter /></KernelProvider>);

        kernel.context("mail").events.emit("mail.arrived", { id: "one" });
        await screen.findByText("one");

        view.unmount();

        expect(() => kernel.context("mail").events.emit("mail.arrived", { id: "two" })).not.toThrow();

        await kernel.stop();
    });

    /**
     * StrictMode mounts, unmounts and mounts again. An ear that is not
     * cleaned up would then be two, and one arrival would count as two.
     */
    test("hears once under StrictMode, not twice", async () =>
    {
        const kernel = await startKernel();

        render(<StrictMode><KernelProvider kernel={kernel}><Counter /></KernelProvider></StrictMode>);

        kernel.context("mail").events.emit("mail.arrived", { id: "one" });

        expect(await screen.findByText("one")).toBeDefined();

        await kernel.stop();
    });
});
