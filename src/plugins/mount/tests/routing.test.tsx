import { afterEach, describe, expect, test, vi } from "vitest";

import { definePlugin } from "../../kernel/api";
import { start } from "../api";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { ComponentType, ReactNode } from "react";
import type { RouterBuilding } from "../api";

afterEach(() =>
{
    vi.unstubAllGlobals();
});

const Page = (): ReactNode => createElement("span", null, "the page goes here");

function recording()
{
    const built: string[] = [];
    const shells: unknown[] = [];

    const router: RouterBuilding = {
        building: {
            createRootRoute: (options) =>
            {
                shells.push(options.component);

                return { addChildren: (children: unknown[]) => ({ children }) } as never;
            },
            createRoute: (options) =>
            {
                built.push(options.path ?? `#${options.id ?? ""}`);

                return options;
            },
            createRouter: (options) => options,
        },
        missing: Page,
        outlet: Page,
        landing: () => Page,
        wrap: (frame, Outlet) => (frame === undefined
            ? Outlet
            : () => createElement(frame, undefined, createElement(Outlet))),
        guard: () => Page,
    };

    return { router, built, shells };
}

const page = (name: string, path: string) =>
    definePlugin(name, {
        version: "1.0.0",
        describe: `The ${name} page.`,
        routes: [{ path, title: "A page", component: Page }],
    });

describe("the router an application starts with", () =>
{
    test("is built from what plugins declared, so nothing assembles it a second time", async () =>
    {
        const spy = recording();

        const app = await start({
            plugins: [page("items", "/items"), page("about", "/about")],
            transport: { baseUrl: "/api" },
            router: spy.router,
        });

        expect(app.router).toBeDefined();
        expect(spy.built[0]).toBe("/");
        expect([...spy.built].sort()).toEqual(["/", "/about", "/items"]);

        await app.stop();
    });

    test("and serves the root from the plugin that declares it, adding nothing in front", async () =>
    {
        const spy = recording();

        const app = await start({
            plugins: [page("home", "/"), page("about", "/about")],
            transport: { baseUrl: "/api" },
            router: spy.router,
        });

        expect(spy.built).toHaveLength(2);
        expect(spy.built.filter((path) => path === "/")).toHaveLength(1);

        await app.stop();
    });

    test("and is undefined where none was asked for, so an application may render its own", async () =>
    {
        const app = await start({ plugins: [page("items", "/items")], transport: { baseUrl: "/api" } });

        expect(app.router).toBeUndefined();

        await app.stop();
    });
});

describe("what wraps every page", () =>
{
    test("is the frame a plugin declared, so an application never names which plugin holds it", async () =>
    {
        const spy = recording();
        const Shell = ({ children }: { children?: ReactNode }): ReactNode =>
            createElement("div", { "data-proof": "shell" }, children);

        const framing = definePlugin("shell", { version: "1.0.0", describe: "The frame.", frame: Shell });

        const app = await start({
            plugins: [framing, page("items", "/items")],
            transport: { baseUrl: "/api" },
            router: spy.router,
        });

        const rendered = renderToStaticMarkup(createElement(spy.shells[0] as ComponentType));

        expect(rendered).toContain("data-proof");
        expect(rendered).toContain("the page goes here");

        await app.stop();
    });

    test("and passes the page through where no plugin declares one, rather than refusing to build", async () =>
    {
        const spy = recording();

        const app = await start({
            plugins: [page("items", "/items")],
            transport: { baseUrl: "/api" },
            router: spy.router,
        });

        expect(spy.shells[0]).toBe(Page);
        expect(app.router).toBeDefined();

        await app.stop();
    });
});
