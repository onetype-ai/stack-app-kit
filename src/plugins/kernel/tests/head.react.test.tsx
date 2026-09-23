import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";

import { createKernel, definePlugin } from "../api";
import type { Route } from "../api";
import { KernelProvider, RouteGuard } from "../react/index";

afterEach(() =>
{
    cleanup();
    document.head.innerHTML = "";
});

async function guarding(routes: readonly Route[], logged: string[] = [])
{
    const kernel = createKernel({
        plugins: [definePlugin("items", { version: "1.0.0", describe: "Lists items.", routes })],
        log: (level, _plugin, line) =>
        {
            logged.push(`${level}: ${line}`);
        },
    });

    await kernel.start();

    return kernel;
}

describe("the head a page declares", () =>
{
    test("replaces what a prerender wrote, rather than adding a second copy beside it", async () =>
    {
        document.head.innerHTML = "<meta name=\"description\" content=\"from the server\" data-kit-head>";
        const kernel = await guarding([{ path: "/a", title: "A", component: () => <p>a</p>, head: () => ({ description: "from the browser" }) }]);

        render(<KernelProvider kernel={kernel}><RouteGuard route={kernel.routes()[0]!} /></KernelProvider>);

        await waitFor(() =>
        {
            expect(Array.from(document.head.querySelectorAll("meta[name=description]"), (meta) => meta.getAttribute("content"))).toEqual(["from the browser"]);
        });
    });

    test("reaches the document, with the path's parameters", async () =>
    {
        const kernel = await guarding([{
            path: "/items/$id",
            title: "Item",
            component: () => <p>item</p>,
            head: (_ctx, { id }) => ({ description: `Item ${id ?? "?"}`, canonical: `https://shop.example/items/${id ?? ""}` }),
        }]);
        const route = kernel.routes()[0];

        render(<KernelProvider kernel={kernel}><RouteGuard route={route!} params={{ id: "7" }} /></KernelProvider>);

        await waitFor(() =>
        {
            expect(document.head.querySelector("meta[name=description]")?.getAttribute("content")).toBe("Item 7");
        });
        expect(document.head.querySelector("link[rel=canonical]")?.getAttribute("href")).toBe("https://shop.example/items/7");
        expect(document.title).toBe("Item");
    });

    test("is replaced by the next page's, leaving tags it never wrote alone", async () =>
    {
        const kernel = await guarding([
            { path: "/a", title: "A", component: () => <p>a</p>, head: () => ({ description: "first" }) },
            { path: "/b", title: "B", component: () => <p>b</p> },
        ]);
        const [first, second] = kernel.routes();
        const foreign = document.createElement("meta");
        foreign.setAttribute("name", "theme-color");
        document.head.append(foreign);

        const shown = render(<KernelProvider kernel={kernel}><RouteGuard route={first!} /></KernelProvider>);
        await waitFor(() =>
        {
            expect(document.head.querySelector("meta[name=description]")).not.toBeNull();
        });
        shown.rerender(<KernelProvider kernel={kernel}><RouteGuard route={second!} /></KernelProvider>);

        await waitFor(() =>
        {
            expect(document.title).toBe("B");
        });
        expect(document.head.querySelector("meta[name=description]")).toBeNull();
        expect(document.head.querySelector("meta[name=theme-color]")).toBe(foreign);
    });

    test("is refused when it fails validation, logging why and keeping only the title", async () =>
    {
        const logged: string[] = [];
        const kernel = await guarding([{ path: "/a", title: "A", component: () => <p>a</p>, head: () => ({ canonical: "javascript:alert(1)" }) }], logged);

        render(<KernelProvider kernel={kernel}><RouteGuard route={kernel.routes()[0]!} /></KernelProvider>);

        await waitFor(() =>
        {
            expect(logged).toEqual([expect.stringContaining("error: head of \"/a\" was refused")]);
        });
        expect(document.head.querySelector("link[rel=canonical]")).toBeNull();
        expect(document.title).toBe("A");
    });
});
