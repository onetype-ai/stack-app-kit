import type { Host } from "../../kernel/host";

/** What this plugin offers itself as. */
export const NAME = "e2e";

/** What `e2e.from(host)` answers: the entry an end-to-end test imports in Node. */
export type E2e = {
    entry: "@onetype/stack-app-kit/e2e";
};

/** The e2e plugin, for a plugin that declared "e2e" in needs. */
export function from(host: Host): E2e | undefined
{
    return host.take<E2e>(NAME);
}
