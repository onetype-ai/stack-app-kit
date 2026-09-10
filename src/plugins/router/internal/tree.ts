import type { ComponentType } from "react";

import type { Kernel, RegisteredRoute } from "../../kernel/api";
import type { RouterOptions, Frame } from "../api";

export function tree(
    kernel: Kernel,
    building: RouterOptions,
    frame: Frame,
    guard: (route: RegisteredRoute) => ComponentType,
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

            validateSearch: (query) =>
            {
                return route.search === undefined ? {} : route.search.parse(query);
            },
        }),
    );

    return building.createRouter({ routeTree: root.addChildren(children) });
}
