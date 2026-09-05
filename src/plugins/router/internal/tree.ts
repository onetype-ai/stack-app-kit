import type { ComponentType } from "react";

import type { Kernel, Registered } from "../../kernel/api";
import type { Building, Frame } from "../api";

/**
 * Builds a route tree from what the plugins declared.
 *
 * The kernel owns which routes exist and who may see them; this turns that
 * list into whatever the router library wants. Swapping the library changes
 * this file and nothing a plugin wrote.
 */
export function tree(
    kernel: Kernel,
    building: Building,
    frame: Frame,
    guard: (route: Registered) => ComponentType,
): unknown
{
    const root = building.createRootRoute({
        component: frame.shell,
        notFoundComponent: frame.missing,
    });

    const children = kernel.routes().map((route) =>
        building.createRoute({
            getParentRoute: () => root,
            path: route.path,
            component: guard(route),

            // Declared or not at all: a route that named no schema takes
            // nothing from the query, so nothing reaches its page.
            validateSearch: (raw) =>
            {
                return route.search === undefined ? {} : route.search.parse(raw);
            },
        }),
    );

    return building.createRouter({ routeTree: root.addChildren(children) });
}
