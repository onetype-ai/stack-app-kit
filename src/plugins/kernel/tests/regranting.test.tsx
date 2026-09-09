import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";

import { createKernel, definePlugin } from "../api";
import { KernelProvider, RouteGuard } from "../react";

import type { Registered } from "../api";

afterEach(cleanup);

const Page = () => <p>the page</p>;

describe("a viewer who signs in while the page is open", () =>
{
    test("sees the page they were refused a moment ago, without a reload", async () =>
    {
        let held: readonly string[] = [];

        const shop = definePlugin("shop", {
            version: "1.0.0",
            describe: "Sells.",
            permissions: { "shop.buy": { describe: "May buy." } },
        });

        const kernel = createKernel({
            plugins: [shop],
            permissions: { granted: () => held },
        });

        await kernel.start();

        const route: Registered = {
            path: "/pay",
            title: "A page",
            component: Page,
            plugin: "shop",
            fallback: undefined,
            requires: ["shop.buy"],
        };

        render(<KernelProvider kernel={kernel}><RouteGuard route={route} /></KernelProvider>);

        expect(screen.queryByText("the page")).toBeNull();

        held = ["shop.buy"];
        kernel.permissions.changed();

        expect(await screen.findByText("the page")).toBeDefined();
    });

    test("sees a page setup only learned they may see, without being told twice", async () =>
    {
        let confirmed = false;
        let release = (): void => {};

        const shop = definePlugin("shop", {
            version: "1.0.0",
            describe: "Sells.",
            permissions: { "shop.buy": { describe: "May buy." } },
            grants: () => (confirmed ? ["shop.buy"] : []),
            setup: async () =>
            {
                // A round trip: the plugin holding identity asks the server
                // who is here before it can answer grants at all.
                await new Promise<void>((go) => { release = go; });

                confirmed = true;
            },
        });

        const kernel = createKernel({ plugins: [shop] });
        const starting = kernel.start();

        const route: Registered = {
            path: "/pay",
            title: "A page",
            component: Page,
            plugin: "shop",
            fallback: undefined,
            requires: ["shop.buy"],
        };

        render(<KernelProvider kernel={kernel}><RouteGuard route={route} /></KernelProvider>);

        expect(screen.queryByText("the page")).toBeNull();

        release();
        await starting;

        // Nothing called changed(): a reader who reloaded a page they may see
        // should not have to be told by a plugin that the boot they waited
        // for finished.
        expect(await screen.findByText("the page")).toBeDefined();
    });

    test("loses it again when the plugin holding identity says the session ended", async () =>
    {
        let held: readonly string[] = ["shop.buy"];

        const shop = definePlugin("shop", {
            version: "1.0.0",
            describe: "Sells.",
            permissions: { "shop.buy": { describe: "May buy." } },
        });

        const kernel = createKernel({
            plugins: [shop],
            permissions: { granted: () => held },
        });

        await kernel.start();

        const route: Registered = {
            path: "/pay",
            title: "A page",
            component: Page,
            plugin: "shop",
            fallback: undefined,
            requires: ["shop.buy"],
        };

        render(<KernelProvider kernel={kernel}><RouteGuard route={route} /></KernelProvider>);

        expect(await screen.findByText("the page")).toBeDefined();

        // Through ctx, which is all a plugin holds: the one that hears a
        // session end is a plugin, not the application that built the kernel.
        held = [];
        kernel.context("shop").permissions.changed();

        await waitFor(() => { expect(screen.queryByText("the page")).toBeNull(); });
    });
});
