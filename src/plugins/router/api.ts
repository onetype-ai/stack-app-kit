import type { ComponentType } from "react";

/** What this plugin offers itself as. */
export const NAME = "router";

/**
 * The part of a router library this plugin drives.
 *
 * A shape rather than the library: the kit does not force a version, and a
 * test builds a tree without one.
 */
export type Building = {
    createRootRoute: (options: {
        component: ComponentType;
        notFoundComponent: ComponentType;
    }) => Root;
    createRoute: (options: {
        getParentRoute: () => Root;
        path: string;
        component: ComponentType;
        validateSearch?: (raw: Record<string, unknown>) => unknown;
    }) => Child;
    createRouter: (options: { routeTree: Root }) => unknown;
};

export type Root = { addChildren: (children: Child[]) => Root };

export type Child = unknown;

/** What the frame around every page needs. */
export type Frame = {
    shell: ComponentType;
    missing: ComponentType;
};
