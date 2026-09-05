import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";
import { z } from "zod";

import { createKernel, definePlugin } from "../api";
import type { Definition, Plugin } from "../api";
import { KernelProvider, RouteGuard, Slot, StatusPageProvider } from "../react/index";

afterEach(cleanup);

function made(name: string, held: Partial<Definition> = {}): Plugin
{
    return definePlugin(name, { version: "1.0.0", describe: `The ${name} plugin.`, ...held });
}

/** A started kernel, rendered under a provider. */
async function shown(plugins: readonly Plugin[], granted: readonly string[], children: React.ReactNode)
{
    const kernel = createKernel({ plugins, permissions: { granted: () => granted } });

    await kernel.start();

    render(<KernelProvider kernel={kernel}>{children}</KernelProvider>);

    return kernel;
}

const shell = (held: Partial<Definition> = {}): Plugin =>
    made("shell", {
        slots: { "shell.sidebar": { describe: "beside the page", schema: z.object({ noteId: z.string() }) } },
        ...held,
    });

describe("Slot", () =>
{
    test("passes each contribution the validated payload", async () =>
    {
        await shown(
            [
                shell(),
                made("billing", {
                    dependsOn: ["shell"],
                    contributes: [
                        {
                            slot: "shell.sidebar",
                            render: ({ payload }) => <span>{`note ${(payload as { noteId: string }).noteId}`}</span>,
                        },
                    ],
                }),
            ],
            [],
            <Slot name="shell.sidebar" payload={{ noteId: "n1" }} />,
        );

        expect(screen.getByText("note n1")).toBeDefined();
    });

    test("renders contributions in order", async () =>
    {
        await shown(
            [
                shell(),
                made("a", {
                    dependsOn: ["shell"],
                    contributes: [{ slot: "shell.sidebar", order: 20, render: () => <span>second</span> }],
                }),
                made("b", {
                    dependsOn: ["shell"],
                    contributes: [{ slot: "shell.sidebar", order: 10, render: () => <span>first</span> }],
                }),
            ],
            [],
            <Slot name="shell.sidebar" payload={{ noteId: "n1" }} />,
        );

        expect(document.body.textContent).toBe("firstsecond");
    });

    test("hides what the viewer lacks permission for", async () =>
    {
        await shown(
            [
                shell({ permissions: { "shell.admin": { describe: "may see admin things" } } }),
                made("billing", {
                    dependsOn: ["shell"],
                    contributes: [
                        { slot: "shell.sidebar", requires: ["shell.admin"], render: () => <span>secret</span> },
                        { slot: "shell.sidebar", render: () => <span>public</span> },
                    ],
                }),
            ],
            [],
            <Slot name="shell.sidebar" payload={{ noteId: "n1" }} />,
        );

        expect(screen.queryByText("secret")).toBeNull();
        expect(screen.getByText("public")).toBeDefined();
    });

    test("one contribution throwing does not blank the others", async () =>
    {
        await shown(
            [
                shell(),
                made("bad", {
                    dependsOn: ["shell"],
                    contributes: [
                        {
                            slot: "shell.sidebar",
                            render: () =>
                            {
                                throw new Error("boom");
                            },
                        },
                    ],
                }),
                made("good", {
                    dependsOn: ["shell"],
                    contributes: [{ slot: "shell.sidebar", render: () => <span>still here</span> }],
                }),
            ],
            [],
            <Slot name="shell.sidebar" payload={{ noteId: "n1" }} />,
        );

        expect(screen.getByText("still here")).toBeDefined();
        expect(screen.getByText(/"bad" failed to render/)).toBeDefined();
    });

    test("a payload failing the slot's schema is reported rather than passed on", async () =>
    {
        await shown(
            [
                shell(),
                made("billing", {
                    dependsOn: ["shell"],
                    contributes: [{ slot: "shell.sidebar", render: () => <span>never</span> }],
                }),
            ],
            [],
            <Slot name="shell.sidebar" payload={{ noteId: 7 }} />,
        );

        expect(screen.queryByText("never")).toBeNull();
        expect(screen.getByRole("alert").textContent).toMatch(/does not match its schema/);
    });
});

describe("RouteGuard", () =>
{
    test("renders the page when the permission is held", async () =>
    {
        const kernel = createKernel({
            plugins: [
                made("billing", {
                    permissions: { "billing.read": { describe: "may see billing" } },
                    routes: [{ path: "/billing", component: () => <h1>Billing</h1>, requires: ["billing.read"] }],
                }),
            ],
            permissions: { granted: () => ["billing.read"] },
        });

        await kernel.start();

        const route = kernel.routes()[0];

        render(
            <KernelProvider kernel={kernel}>
                <RouteGuard route={route!} />
            </KernelProvider>,
        );

        expect(screen.getByText("Billing")).toBeDefined();
    });

    test("renders 403 when it is not", async () =>
    {
        const kernel = createKernel({
            plugins: [
                made("billing", {
                    permissions: { "billing.read": { describe: "may see billing" } },
                    routes: [{ path: "/billing", component: () => <h1>Billing</h1>, requires: ["billing.read"] }],
                }),
            ],
            permissions: { granted: () => [] },
        });

        await kernel.start();

        render(
            <KernelProvider kernel={kernel}>
                <RouteGuard route={kernel.routes()[0]!} />
            </KernelProvider>,
        );

        expect(screen.queryByText("Billing")).toBeNull();
        expect(screen.getByRole("alert")).toBeDefined();
    });

    test("sets the title", async () =>
    {
        const kernel = createKernel({
            plugins: [made("billing", { routes: [{ path: "/b", component: () => <p>x</p>, title: "Billing" }] })],
        });

        await kernel.start();

        render(
            <KernelProvider kernel={kernel}>
                <RouteGuard route={kernel.routes()[0]!} />
            </KernelProvider>,
        );

        expect(document.title).toBe("Billing");
    });

    test("wraps the page in its plugin's fallback", async () =>
    {
        const kernel = createKernel({
            plugins: [
                made("billing", {
                    fallback: ({ plugin }) => <p>{`${plugin} is down`}</p>,
                    routes: [
                        {
                            path: "/b",
                            component: () =>
                            {
                                throw new Error("boom");
                            },
                        },
                    ],
                }),
            ],
        });

        await kernel.start();

        render(
            <KernelProvider kernel={kernel}>
                <RouteGuard route={kernel.routes()[0]!} />
            </KernelProvider>,
        );

        expect(screen.getByText("billing is down")).toBeDefined();
    });

    test("a replaced 403 is what shows", async () =>
    {
        const kernel = createKernel({
            plugins: [
                made("billing", {
                    permissions: { "billing.read": { describe: "may see billing" } },
                    routes: [{ path: "/b", component: () => <p>x</p>, requires: ["billing.read"] }],
                }),
            ],
            permissions: { granted: () => [] },
        });

        await kernel.start();

        render(
            <KernelProvider kernel={kernel}>
                <StatusPageProvider pages={{ forbidden: () => <p>Ask an admin.</p> }}>
                    <RouteGuard route={kernel.routes()[0]!} />
                </StatusPageProvider>
            </KernelProvider>,
        );

        expect(screen.getByText("Ask an admin.")).toBeDefined();
    });
});

describe("a slot that takes no payload", () =>
{
    test("renders when the slot's schema is empty and none was passed", async () =>
    {
        await shown(
            [
                made("shell", { slots: { "shell.nav": { describe: "nav", schema: z.object({}) } } }),
                made("demo", {
                    dependsOn: ["shell"],
                    contributes: [{ slot: "shell.nav", render: () => <span>Home</span> }],
                }),
            ],
            [],
            <Slot name="shell.nav" />,
        );

        expect(screen.getByText("Home")).toBeDefined();
    });
});
