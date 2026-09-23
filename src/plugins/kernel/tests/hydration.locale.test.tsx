import { act, cleanup } from "@testing-library/react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, test } from "vitest";

import { createKernel, definePlugin } from "../api";
import type { Kernel } from "../api";
import { KernelProvider, prerenderedLocale, useLocale, useLocaleAfterHydration } from "../react/index";

afterEach(() =>
{
    cleanup();
    document.body.innerHTML = "";
    document.documentElement.lang = "";
});

const home = definePlugin("home", {
    version: "1.0.0",
    describe: "The home page.",
    messages: { en: { title: "Home" }, de: { title: "Startseite" } },
});

async function kernelIn(current: string): Promise<Kernel>
{
    const kernel = createKernel({ plugins: [home], locale: { supported: ["en", "de"], fallback: "en", current } });

    await kernel.start();

    return kernel;
}

function Title({ viewer }: { viewer?: string }): React.ReactNode
{
    useLocaleAfterHydration(viewer);

    return <h1>{useLocale("home").text("title")}</h1>;
}

describe("a page written in one locale for a viewer who reads another", () =>
{
    test("hydrates in the locale it was written in, then turns to the viewer's, without a mismatch", async () =>
    {
        const server = await kernelIn("en");
        const markup = renderToString(<KernelProvider kernel={server}><Title /></KernelProvider>);
        document.body.innerHTML = `<script type="application/json" id="kit-state" data-locale="en">null</script><div id="root">${markup}</div>`;
        const errors: unknown[] = [];

        const client = await kernelIn(prerenderedLocale() ?? "de");
        await act(async () =>
        {
            hydrateRoot(document.getElementById("root") as HTMLElement, <KernelProvider kernel={client}><Title viewer="de" /></KernelProvider>, {
                onRecoverableError: (error) => errors.push(error),
            });
        });

        expect(errors).toEqual([]);
        expect(document.querySelector("h1")?.textContent).toBe("Startseite");
        expect(document.documentElement.lang).toBe("de");
    });

    test("finds no written locale on a page the browser rendered first", () =>
    {
        expect(prerenderedLocale()).toBeUndefined();
    });
});
