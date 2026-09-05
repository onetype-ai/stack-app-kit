import { describe, expect, test } from "vitest";

import { tree } from "../internal/tree";

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

function serving(routes: readonly Registered[])
{
    const made: Record<string, unknown>[] = [];
    const roots: Record<string, unknown>[] = [];

    let handed: unknown;

    const building: Building = {
        createRootRoute: (options) =>
        {
            roots.push(options);

            return { addChildren: (children: unknown[]) => ({ root: options, children }) } as never;
        },
        createRoute: (options) =>
        {
            made.push(options);

            return options;
        },
        createRouter: (options) =>
        {
            handed = options;

            return options;
        },
    };

    const kernel = { routes: () => routes } as Kernel;
    const frame: Frame = { shell: Shell, missing: Missing };

    return { building, kernel, frame, made, roots, handed: () => handed };
}

describe("the route tree", () =>
{
    test("holds one route for each the kernel registered, in that order", () =>
    {
        const held = serving([registered("/items"), registered("/items/$id"), registered("/about")]);

        tree(held.kernel, held.building, held.frame, () => Page);

        expect(held.made.map((one) => one["path"])).toEqual(["/items", "/items/$id", "/about"]);
    });

    test("and hangs every one off the root, never off each other", () =>
    {
        const held = serving([registered("/one"), registered("/two")]);

        tree(held.kernel, held.building, held.frame, () => Page);

        const parents = held.made.map((one) => (one["getParentRoute"] as () => unknown)());

        expect(new Set(parents).size).toBe(1);
    });

    /**
     * The guard decides what a route renders, so a page nobody may see never
     * reaches the router. Passing the component through would show it.
     */
    test("renders what the guard answers, never the route's own component", () =>
    {
        const held = serving([registered("/private")]);
        const Guarded = (() => null) as ComponentType;

        tree(held.kernel, held.building, held.frame, () => Guarded);

        expect(held.made[0]?.["component"]).toBe(Guarded);
        expect(held.made[0]?.["component"]).not.toBe(Page);
    });

    test("gives the guard the route it is guarding, so it can read `requires`", () =>
    {
        const held = serving([registered("/a"), registered("/b")]);
        const seen: string[] = [];

        tree(held.kernel, held.building, held.frame, (route) =>
        {
            seen.push(route.path);

            return Page;
        });

        expect(seen).toEqual(["/a", "/b"]);
    });

    test("takes the shell and the not-found page from the frame", () =>
    {
        const held = serving([registered("/x")]);

        tree(held.kernel, held.building, held.frame, () => Page);

        expect(held.roots[0]?.["component"]).toBe(Shell);
        expect(held.roots[0]?.["notFoundComponent"]).toBe(Missing);
    });

    test("and builds a router even when no plugin declared a route", () =>
    {
        const held = serving([]);

        expect(tree(held.kernel, held.building, held.frame, () => Page)).toBeDefined();
        expect(held.made).toEqual([]);
    });
});
