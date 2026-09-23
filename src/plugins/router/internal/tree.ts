import type { ComponentType } from "react";

import type { Kernel, RegisteredRoute } from "../../kernel/api";
import type { RouterOptions, Frame, Root } from "../api";

export function tree(
    kernel: Kernel,
    building: RouterOptions,
    frame: Frame,
    guard: (route: RegisteredRoute) => ComponentType,
): unknown
{
    const declared = kernel.routes();
    const isFrameless = (route: RegisteredRoute): boolean => route.frame === false || (route.frame === undefined && route.render === "prerender");
    const frameless = frame.outlet === undefined ? [] : declared.filter(isFrameless);
    const splits = frameless.length > 0;

    const root = building.createRootRoute({
        component: splits && frame.outlet !== undefined ? frame.outlet : frame.shell,
        notFoundComponent: splits ? frame.framedMissing ?? frame.missing : frame.missing,
    });

    const framed = splits
        ? building.createRoute({ getParentRoute: () => root, id: "framed", component: frame.shell }) as Root
        : root;

    const landing = declared[0];

    const toLanding = landing === undefined || declared.some((route) => route.path === "/")
        ? []
        : [building.createRoute({
            getParentRoute: () => framed,
            path: "/",
            component: frame.landing(landing.path),
        })];

    const child = (route: RegisteredRoute, parent: Root) => building.createRoute({
        getParentRoute: () => parent,
        path: route.path,
        component: guard(route),

        validateSearch: (query) =>
        {
            return route.search === undefined ? {} : route.search.parse(query);
        },
    });

    const inFrame = declared.filter((route) => !frameless.includes(route)).map((route) => child(route, framed));

    if (!splits)
    {
        return building.createRouter({ routeTree: root.addChildren([...toLanding, ...inFrame]) });
    }

    return building.createRouter({
        routeTree: root.addChildren([framed.addChildren([...toLanding, ...inFrame]), ...frameless.map((route) => child(route, root))]),
    });
}
