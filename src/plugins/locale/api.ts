import type { Host } from "../../kernel/host";
import { negotiate } from "./internal/negotiate";

/** What this plugin offers itself as. */
export const NAME = "locale";

/** What `locale.from(host)` answers. */
export type Locale = {
    /** The one tag from `supported` a viewer gets: a supported stored choice, then the accepted languages in order (exact, then by language), then `fallback`. */
    negotiate: typeof negotiate;
};

/** The locale helpers, for a plugin that declared "locale" in needs. */
export function from(host: Host): Locale | undefined
{
    return host.take<Locale>(NAME);
}

export { negotiate };
