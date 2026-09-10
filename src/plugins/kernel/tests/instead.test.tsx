import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";

import { createKernel, definePlugin } from "../api";
import { KernelProvider, RouteGuard } from "../react/index";

import type { Kernel, RegisteredRoute } from "../api";
import type { ReactNode } from "react";

afterEach(cleanup);

const Page = (): ReactNode => <p>the page</p>;

async function startKernel(instead?: () => string | undefined): Promise<{ kernel: Kernel; route: RegisteredRoute }>
{
    const kernel = createKernel({
        plugins: [definePlugin("checkout", { version: "1.0.0", describe: "Pays." })],
    });

    await kernel.start();

    return {
        kernel,
        route: {
            path: "/pay",
            title: "A page",
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
        const started = await startKernel();

        render(<KernelProvider kernel={started.kernel}><RouteGuard route={started.route} /></KernelProvider>);

        expect(screen.getByText("the page")).toBeDefined();

        await started.kernel.stop();
    });

    test("sends them where the route said, before the page renders", async () =>
    {
        const started = await startKernel(() => "/cart");
        const goingTo: string[] = [];

        render(
            <KernelProvider kernel={started.kernel}>
                <RouteGuard route={started.route} send={(to) => { goingTo.push(to); return <p>{`going to ${to}`}</p>; }} />
            </KernelProvider>,
        );

        expect(goingTo).toEqual(["/cart"]);
        expect(screen.queryByText("the page")).toBeNull();

        await started.kernel.stop();
    });

    test("and is handed the plugin's own context to decide with", async () =>
    {
        const consulted: string[] = [];
        const started = await startKernel();

        started.route = {
            ...started.route,
            instead: (ctx) =>
            {
                consulted.push(ctx.name);

                return undefined;
            },
        };

        render(<KernelProvider kernel={started.kernel}><RouteGuard route={started.route} /></KernelProvider>);

        expect(consulted).toEqual(["checkout"]);

        await started.kernel.stop();
    });

    test("renders nothing rather than the page when nobody said how to send", async () =>
    {
        const started = await startKernel(() => "/cart");

        render(<KernelProvider kernel={started.kernel}><RouteGuard route={started.route} /></KernelProvider>);

        expect(screen.queryByText("the page")).toBeNull();

        await started.kernel.stop();
    });
});

describe("a route that is both forbidden and early", () =>
{
    async function startGuarded(granted: readonly string[]): Promise<{ kernel: Kernel; route: RegisteredRoute }>
    {
        const kernel = createKernel({
            plugins: [
                definePlugin("checkout", {
                    version: "1.0.0",
                    describe: "Pays.",
                    permissions: { "checkout.pay": { describe: "May pay." } },
                }),
            ],
            permissions: { granted: () => granted },
        });

        await kernel.start();

        return {
            kernel,
            route: {
                path: "/pay",
                title: "A page",
                component: Page,
                plugin: "checkout",
                fallback: undefined,
                requires: ["checkout.pay"],
                instead: () => "/sign-in",
            },
        };
    }

    test("sends the viewer where they belong rather than refusing them", async () =>
    {
        const started = await startGuarded([]);
        const goingTo: string[] = [];

        render(
            <KernelProvider kernel={started.kernel}>
                <RouteGuard route={started.route} send={(to) => { goingTo.push(to); return <p>{`going to ${to}`}</p>; }} />
            </KernelProvider>,
        );

        expect(goingTo).toEqual(["/sign-in"]);

        await started.kernel.stop();
    });

    test("and says nothing about a permission the viewer was never offered", async () =>
    {
        const started = await startGuarded([]);

        render(
            <KernelProvider kernel={started.kernel}>
                <RouteGuard route={started.route} send={(to) => <p>{`going to ${to}`}</p>} />
            </KernelProvider>,
        );

        expect(screen.queryByText("You do not have permission to see this.")).toBeNull();

        await started.kernel.stop();
    });

    test("still refuses a viewer who belongs here and may not see it", async () =>
    {
        const kernel = createKernel({
            plugins: [
                definePlugin("checkout", {
                    version: "1.0.0",
                    describe: "Pays.",
                    permissions: { "checkout.pay": { describe: "May pay." } },
                }),
            ],
            permissions: { granted: () => [] },
        });

        await kernel.start();

        const route: RegisteredRoute = {
            path: "/pay",
            title: "A page",
            component: Page,
            plugin: "checkout",
            fallback: undefined,
            requires: ["checkout.pay"],
        };

        render(<KernelProvider kernel={kernel}><RouteGuard route={route} /></KernelProvider>);

        expect(screen.getByText("You do not have permission to see this.")).toBeDefined();

        await kernel.stop();
    });

    test("and renders the page for a viewer who may see it and belongs here", async () =>
    {
        const started = await startGuarded(["checkout.pay"]);

        started.route = { ...started.route, instead: () => undefined };

        render(<KernelProvider kernel={started.kernel}><RouteGuard route={started.route} /></KernelProvider>);

        expect(screen.getByText("the page")).toBeDefined();

        await started.kernel.stop();
    });
});
