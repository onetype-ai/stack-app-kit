import type { ComponentType, FunctionComponent, ReactNode } from "react";

import type { Cache, HttpClient, Kernel, Logger, Plugin as AppPlugin, Realtime, PermissionSource, RegisteredRoute } from "../kernel/api";
import type { RouterOptions } from "../router/api";
import type { TransportOptions as TransportOptions } from "../transport/api";

export { discover } from "./internal/discover";
export type { PluginModules } from "./internal/discover";
export { start } from "./internal/start";

/** What this plugin offers itself as. */
export const NAME = "mount";

/** What an application says to bring itself up. */
export type StartOptions = {
    /** The plugins it holds. `discover` finds them from the filesystem. */
    plugins: readonly AppPlugin[];

    /** Where the server is, and how to reach it. */
    transport: TransportOptions;

    config?: Readonly<Record<string, unknown>> | undefined;
    permissions?: PermissionSource | undefined;
    log?: Logger | undefined;

    /** Which plugin may answer what the viewer holds; any other declaring `grants` is refused. */
    grantedBy?: string | undefined;

    /** Dropping what a view holds. Omit and `ctx.cache` refuses, naming itself. */
    cache?: Cache | undefined;

    /** The router library and the frame around every page. Omit and `router` is undefined, for an application rendering its own. */
    router?: RouterBuilding | undefined;
};

/**
 * What building a router takes: the library, and what wraps every page.
 *
 * The shell comes from whichever plugin declared `frame`, so an application
 * names neither it nor which plugin holds it.
 */
export type RouterBuilding = {
    building: RouterOptions;

    /** What renders where no route matched. */
    missing: ComponentType;

    /** Where the matched page renders inside the frame; routers hand this over rather than passing children. */
    outlet: ComponentType;

    /** Puts the outlet inside the frame a plugin declared, or answers the outlet alone where none did. Written here because `.` renders nothing itself. */
    wrap: (frame: FunctionComponent<{ children?: ReactNode }> | undefined, outlet: ComponentType) => ComponentType;

    /** What renders at `/` when no plugin declares it: a redirect to the first route there is. */
    landing: (to: string) => ComponentType;
    guard: (route: RegisteredRoute) => ComponentType;
};

/** What an application holds once it is up. */
export type StartedApp = {
    kernel: Kernel;
    http: HttpClient;
    realtime: Realtime;

    /** Which channel was live once every plugin had started: the socket is dialled only then, so it carries every plugin's `sends`. */
    channel: "ws" | "http";

    /** The router built from what plugins declared, where `start` was given one to build with. */
    router: unknown;

    /** Stops the plugins, then the socket. */
    stop: () => Promise<void>;
};
