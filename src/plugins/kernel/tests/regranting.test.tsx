import { cleanup, render, screen } from "@testing-library/react";
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
});
