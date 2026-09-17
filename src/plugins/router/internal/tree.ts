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

    const declared = kernel.routes();
    const landing = declared[0];

    const toLanding = landing === undefined || declared.some((route) => route.path === "/")
        ? []
        : [building.createRoute({
            getParentRoute: () => root,
            path: "/",
            component: frame.landing(landing.path),
        })];

    const children = declared.map((route) =>
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

    return building.createRouter({ routeTree: root.addChildren([...toLanding, ...children]) });
}
