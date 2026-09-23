import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";
import { z } from "zod";

import { createKernel, definePlugin } from "../api";
import { KernelProvider, useRegistry } from "../react/index";

import type { ReactNode } from "react";

afterEach(cleanup);

const editor = definePlugin("editor", {
    version: "1.0.0",
    describe: "Edits pages.",
    registries: { "editor.blocks": { describe: "Blocks a page is built from.", entry: z.object({ id: z.string(), label: z.string() }), key: "id" } },
});

function Blocks(): ReactNode
{
    return <p>{useRegistry("editor.blocks").map((entry) => String(entry["label"])).join(", ")}</p>;
}

describe("a registry on screen", () =>
{
    test("shows what is added and taken out while it is mounted", async () =>
    {
        const kernel = createKernel({ plugins: [editor] });
        await kernel.start();
        render(<KernelProvider kernel={kernel}><Blocks /></KernelProvider>);
        const blocks = kernel.context("editor").registry("editor.blocks");

        let stop = (): void => {};
        act(() =>
        {
            stop = blocks.set({ id: "text", label: "Text" });
        });
        const whileSet = screen.getByRole("paragraph").textContent;
        act(() =>
        {
            stop();
        });

        expect(whileSet).toBe("Text");
        expect(screen.getByRole("paragraph").textContent).toBe("");
    });
});
