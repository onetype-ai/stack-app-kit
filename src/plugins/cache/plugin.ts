import type { Host } from "../../kernel/host";
import type { Plugin } from "../../kernel/plugin";
import { NAME, fromQueries, type Queries } from "./api";

/**
 * Turns a query client into the cache the kernel hands plugins.
 *
 * One adapter, here rather than in every application: invalidating by key is
 * the same three lines wherever it is written.
 */
export function plugin(client: Queries): Plugin
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
