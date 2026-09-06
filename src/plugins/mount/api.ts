import type { Cache, Client, Kernel, Logger, Plugin as AppPlugin, Realtime, Source } from "../kernel/api";
import type { Settings as TransportSettings } from "../transport/api";

export { discover } from "./internal/discover";
export type { Modules } from "./internal/discover";
export { start } from "./internal/start";

/** What this plugin offers itself as. */
export const NAME = "mount";

/** What an application says to bring itself up. */
export type Starting = {
    /** The plugins it holds. `discover` finds them from the filesystem. */
    plugins: readonly AppPlugin[];

    /** Where the server is, and how to reach it. */
    transport: TransportSettings;

    config?: Readonly<Record<string, unknown>> | undefined;
    permissions?: Source | undefined;
    log?: Logger | undefined;

    /** Dropping what a view holds. Omit and `ctx.cache` refuses, naming itself. */
    cache?: Cache | undefined;
};

/** What an application holds once it is up. */
export type Started = {
    kernel: Kernel;
    http: Client;
    realtime: Realtime;

    /** Which channel carried the first request: "ws" or "http". */
    channel: "ws" | "http";

    /** Stops the plugins, then the socket. */
    stop: () => Promise<void>;
};
