import { describe, expect, test } from "vitest";
import { z } from "zod";

import { boot } from "../../../kernel/boot";
import { plugin as kernelPlugin } from "../../kernel/plugin";
import { from } from "../api";
import { tree } from "../internal/tree";
import { plugin as routerPlugin } from "../plugin";

import type { ComponentType } from "react";
import type { Kernel, Registered } from "../../kernel/api";
import type { Building, Frame } from "../api";

const Page = (() => null) as ComponentType;
const Shell = (() => null) as ComponentType;
const Missing = (() => null) as ComponentType;

function registered(path: string, plugin = "demo"): Registered
{
    return { path, component: Page, plugin, fallback: undefined };
}

function recordRouter(routes: readonly Registered[])
{
    const created: Record<string, unknown>[] = [];
    const roots: Record<string, unknown>[] = [];

    let router: unknown;

    const building: Building = {
        createRootRoute: (options) =>
        {
            roots.push(options);

            return { addChildren: (children: unknown[]) => ({ root: options, children }) } as never;
        },
        createRoute: (options) =>
        {
            created.push(options);

            return options;
        },
        createRouter: (options) =>
        {
            router = options;

            return options;
        },
    };

    const kernel = { routes: () => routes } as Kernel;
    const frame: Frame = { shell: Shell, missing: Missing };

    return { building, kernel, frame, created, roots, router: () => router };
}

describe("the route tree", () =>
{
    test("holds one route for each the kernel registered, in that order", () =>
    {
        const spy = recordRouter([registered("/items"), registered("/items/$id"), registered("/about")]);

        tree(spy.kernel, spy.building, spy.frame, () => Page);

        expect(spy.created.map((route) => route["path"])).toEqual(["/items", "/items/$id", "/about"]);
    });

    test("and hangs every one off the root, never off each other", () =>
    {
        const spy = recordRouter([registered("/one"), registered("/two")]);

        tree(spy.kernel, spy.building, spy.frame, () => Page);

        const parents = spy.created.map((route) => (route["getParentRoute"] as () => unknown)());

        expect(new Set(parents).size).toBe(1);
    });

    /**
     * The guard decides what a route renders, so a page nobody may see never
     * reaches the router. Passing the component through would show it.
     */
    test("renders what the guard answers, never the route's own component", () =>
    {
        const spy = recordRouter([registered("/private")]);
        const Guarded = (() => null) as ComponentType;

        tree(spy.kernel, spy.building, spy.frame, () => Guarded);

        expect(spy.created[0]?.["component"]).toBe(Guarded);
        expect(spy.created[0]?.["component"]).not.toBe(Page);
    });

    test("gives the guard the route it is guarding, so it can read `requires`", () =>
    {
        const spy = recordRouter([registered("/a"), registered("/b")]);
        const seen: string[] = [];

        tree(spy.kernel, spy.building, spy.frame, (route) =>
        {
            seen.push(route.path);

            return Page;
        });

        expect(seen).toEqual(["/a", "/b"]);
    });

    test("takes the shell and the not-found page from the frame", () =>
    {
        const spy = recordRouter([registered("/x")]);

        tree(spy.kernel, spy.building, spy.frame, () => Page);

        expect(spy.roots[0]?.["component"]).toBe(Shell);
        expect(spy.roots[0]?.["notFoundComponent"]).toBe(Missing);
    });

    test("and builds a router even when no plugin declared a route", () =>
    {
        const spy = recordRouter([]);

        expect(tree(spy.kernel, spy.building, spy.frame, () => Page)).toBeDefined();
        expect(spy.created).toEqual([]);
    });
});

describe("what a route takes from the query", () =>
{
    test("is parsed by the schema it declared", () =>
    {
        const spy = recordRouter([{ ...registered("/items"), search: z.object({ page: z.coerce.number().default(1) }) }]);

        tree(spy.kernel, spy.building, spy.frame, () => Page);

        const validate = spy.created[0]?.["validateSearch"] as (raw: Record<string, unknown>) => unknown;

        expect(validate({ page: "3" })).toEqual({ page: 3 });
        expect(validate({})).toEqual({ page: 1 });
    });

    /**
     * Undeclared means it does not exist, here as everywhere: a page reads
     * what its route named, and a query carrying more hands over none of it.
     */
    test("and is nothing at all when it declared none", () =>
    {
        const spy = recordRouter([registered("/items")]);

        tree(spy.kernel, spy.building, spy.frame, () => Page);

        const validate = spy.created[0]?.["validateSearch"] as (raw: Record<string, unknown>) => unknown;

        expect(validate({ page: "3", anything: "else" })).toEqual({});
    });

    test("refuses a value the schema does not take, rather than passing it on", () =>
    {
        const spy = recordRouter([{ ...registered("/items"), search: z.object({ page: z.number() }) }]);

        tree(spy.kernel, spy.building, spy.frame, () => Page);

        const validate = spy.created[0]?.["validateSearch"] as (raw: Record<string, unknown>) => unknown;

        expect(() => validate({ page: "not a number" })).toThrow();
    });
});

describe("reaching the router from another plugin", () =>
{
    const quiet = (): void => {};

    test("answers what it offered, the same way every other plugin does", () =>
    {
        const app = boot(quiet, [kernelPlugin(), routerPlugin(recordRouter([]).building)]);
        const reached = from(app.host.as("demo"));

        expect(typeof reached?.build).toBe("function");
    });

    test("and answers nothing when the router was never given", () =>
    {
        const app = boot(quiet, [kernelPlugin()]);

        expect(from(app.host.as("demo"))).toBeUndefined();
    });
});
