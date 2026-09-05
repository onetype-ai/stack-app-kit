import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";

import { createKernel, definePlugin } from "../api";
import { KernelProvider, RouteGuard } from "../react/index";

import type { Kernel, Registered } from "../api";
import type { ReactNode } from "react";

afterEach(cleanup);

const Page = (): ReactNode => <p>the page</p>;

async function serving(instead?: () => string | undefined): Promise<{ kernel: Kernel; route: Registered }>
{
    const kernel = createKernel({
        plugins: [definePlugin("checkout", { version: "1.0.0", describe: "Pays." })],
    });

    await kernel.start();

    return {
        kernel,
        route: {
            path: "/pay",
            component: Page,
            plugin: "checkout",
            fallback: undefined,
            ...(instead === undefined ? {} : { instead }),
        },
    };
}

describe("a page the viewer may see but should not be on yet", () =>
{
    test("renders when the route sends them nowhere", async () =>
    {
        const held = await serving();

        render(<KernelProvider kernel={held.kernel}><RouteGuard route={held.route} /></KernelProvider>);

        expect(screen.getByText("the page")).toBeDefined();

        await held.kernel.stop();
    });

    /**
     * The bug this closes: without it a page renders, notices it is early,
     * and redirects, so the viewer sees the wrong screen first.
     */
    test("sends them where the route said, before the page renders", async () =>
    {
        const held = await serving(() => "/cart");
        const sent: string[] = [];

        render(
            <KernelProvider kernel={held.kernel}>
                <RouteGuard route={held.route} send={(to) => { sent.push(to); return <p>{`going to ${to}`}</p>; }} />
            </KernelProvider>,
        );

        expect(sent).toEqual(["/cart"]);
        expect(screen.queryByText("the page")).toBeNull();

        await held.kernel.stop();
    });

    test("and is handed the plugin's own context to decide with", async () =>
    {
        const seen: string[] = [];
        const held = await serving();

        held.route = {
            ...held.route,
            instead: (ctx) =>
            {
                seen.push(ctx.name);

                return undefined;
            },
        };

        render(<KernelProvider kernel={held.kernel}><RouteGuard route={held.route} /></KernelProvider>);

        expect(seen).toEqual(["checkout"]);

        await held.kernel.stop();
    });

    test("renders nothing rather than the page when nobody said how to send", async () =>
    {
        const held = await serving(() => "/cart");

        render(<KernelProvider kernel={held.kernel}><RouteGuard route={held.route} /></KernelProvider>);

        expect(screen.queryByText("the page")).toBeNull();

        await held.kernel.stop();
    });
});
