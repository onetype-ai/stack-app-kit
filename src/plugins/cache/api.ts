import type { Host } from "../../kernel/host";
import { KernelFault } from "../kernel/api";
import type { Cache } from "../kernel/api";

/** What this plugin offers itself as. */
export const NAME = "cache";

/** The part of a query client this plugin drives. */
export type Queries = {
    invalidateQueries: (filters: { queryKey: unknown[] }) => unknown;
    cancelQueries?: () => unknown;
    removeQueries?: (filters: { type: "inactive" }) => void;
    resetQueries?: () => unknown;
    prefetchQuery?: (options: { queryKey: unknown[]; queryFn: () => Promise<unknown> }) => Promise<void>;
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

        clear: () =>
        {
            if (client.cancelQueries === undefined || client.removeQueries === undefined || client.resetQueries === undefined)
            {
                throw new KernelFault("INVALID_CONFIG", "cache: clear needs cancelQueries, removeQueries and resetQueries on the query client. Pass the client itself, not a wrapper holding only invalidateQueries.");
            }

            void client.cancelQueries();
            client.removeQueries({ type: "inactive" });
            void client.resetQueries();
        },

        prefetch: (key, fetch) =>
        {
            if (client.prefetchQuery === undefined)
            {
                throw new KernelFault("INVALID_CONFIG", "cache: prefetch needs prefetchQuery on the query client. Pass the client itself.");
            }

            return client.prefetchQuery({ queryKey: [...key], queryFn: fetch });
        },
    };
}

/** The cache, for a plugin that declared "cache" in needs. */
export function from(host: Host): Cache | undefined
{
    return host.take<Cache>(NAME);
}
