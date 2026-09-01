import type { Host } from "../../kernel/host";
import type { Cache } from "../kernel/api";

/** What this plugin offers itself as. */
export const NAME = "cache";

/**
 * The part of a query client this plugin drives.
 *
 * A shape rather than the library, so a test passes its own and the kit does
 * not force a version on the application.
 */
export type Queries = {
    invalidateQueries: (filters: { queryKey: unknown[] }) => unknown;
};

export type { Cache };

/** Builds the cache the kernel hands every plugin. */
export function fromQueries(client: Queries): Cache
{
    return {
        invalidate: (key) =>
        {
            void client.invalidateQueries({ queryKey: [...key] });
        },
    };
}

/** The cache, for a plugin that declared "cache" in needs. */
export function from(host: Host): Cache | undefined
{
    return host.take<Cache>(NAME);
}
