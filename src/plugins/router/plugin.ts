import type { ComponentType } from "react";

import type { Host } from "../../kernel/host";
import type { Plugin } from "../../kernel/plugin";
import type { Kernel, Registered } from "../kernel/api";
import { NAME, type Building, type Frame } from "./api";
import { tree } from "./internal/tree";

/**
 * Turns the routes plugins declared into a router the application renders.
 *
 * The library is a parameter, so the kit forces no version and a test builds
 * a tree without one.
 */
export function plugin(building: Building): Plugin
{
    return {
        name: NAME,
        needs: ["kernel"],

        boot: (host: Host) =>
        {
            host.offer(NAME, {
                build: (kernel: Kernel, frame: Frame, guard: (route: Registered) => ComponentType): unknown =>
                    tree(kernel, building, frame, guard),
            });
        },
    };
}
