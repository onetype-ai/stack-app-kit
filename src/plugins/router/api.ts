import type { ComponentType } from "react";

import { tree } from "./internal/tree";
import type { Host } from "../../kernel/host";
import type { Kernel, RegisteredRoute } from "../kernel/api";

/** What this plugin offers itself as. */
export const NAME = "router";

/** The part of a router library this plugin drives. */
export type RouterOptions = {
    createRootRoute: (options: {
        component: ComponentType;
        notFoundComponent: ComponentType;
    }) => Root;
    createRoute: (options: {
        getParentRoute: () => Root;
        path: string;
        component: ComponentType;
        validateSearch?: (query: Record<string, unknown>) => unknown;
    }) => Child;
    createRouter: (options: { routeTree: Root }) => unknown;
};

/** The route-tree root your router library returned, which takes the pages plugins declared. */
export type Root = { addChildren: (children: Child[]) => Root };

/** A child route, deliberately `unknown`: it constrains nothing, and whatever your router library returns passes. */
export type Child = unknown;

/** What the frame around every page needs. */
export type Frame = {
    shell: ComponentType;
    missing: ComponentType;

    /** What renders at `/` when no plugin declares it: a redirect to the first route there is. */
    landing: (to: string) => ComponentType;
};

/** What the router plugin offers: the tree, built from what plugins declared. */
export type Router = {
    build: (kernel: Kernel, frame: Frame, guard: (route: RegisteredRoute) => ComponentType) => unknown;
};

/** The router, for a plugin that declared "router" in needs. */
export function from(host: Host): Router | undefined
{
    return host.take<Router>(NAME);
}

export { tree };
