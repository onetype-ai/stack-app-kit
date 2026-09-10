import type { Host } from "../../kernel/host";
import type { HostPlugin } from "../../kernel/plugin";
import { NAME, fromQueries, type Queries } from "./api";

/** Turns a query client into the cache the kernel hands plugins. */
export function cachePlugin(client: Queries): HostPlugin
{
    return {
        name: NAME,
        needs: ["kernel"],

        boot: (host: Host) =>
        {
            host.offer(NAME, fromQueries(client));
        },
    };
}
