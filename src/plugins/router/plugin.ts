import type { ComponentType } from "react";

import type { Host } from "../../kernel/host";
import type { HostPlugin } from "../../kernel/plugin";
import type { Kernel, RegisteredRoute } from "../kernel/api";
import { NAME, type RouterOptions, type Frame } from "./api";
import { tree } from "./internal/tree";

/** Turns the routes plugins declared into a router the application renders. */
export function routerPlugin(building: RouterOptions): HostPlugin
{
    return {
        name: NAME,
        needs: ["kernel"],

        boot: (host: Host) =>
        {
            host.offer(NAME, {
                build: (kernel: Kernel, frame: Frame, guard: (route: RegisteredRoute) => ComponentType): unknown =>
                    tree(kernel, building, frame, guard),
            });
        },
    };
}
