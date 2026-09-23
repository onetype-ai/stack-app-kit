import type { Host } from "../../kernel/host";

/** What this plugin offers itself as. */
export const NAME = "server";

/** What `server.from(host)` answers: nothing to call in a browser; the work is in the `./server` entry. */
export type Server = {
    /** The entry a Node process imports for prerendering and rendering per request. */
    entry: "@onetype/stack-app-kit/server";
};

/** The server plugin, for a plugin that declared "server" in needs. */
export function from(host: Host): Server | undefined
{
    return host.take<Server>(NAME);
}
