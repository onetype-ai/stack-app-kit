import type { Host } from "../../kernel/host";
import { configFor } from "./internal/config";
import type { publicProblemsOf } from "./internal/guard";

/** What this plugin offers itself as. */
export const NAME = "settings";

/** What `settings.from(host)` answers. */
export type Settings = {
    /** Maps `VITE_<PLUGIN>__<FIELD>` variables onto each plugin's config, or throws every problem at once. */
    configFor: typeof configFor;

    /** Every public variable that should not ship, one sentence each; empty when all may. */
    problemsOf: typeof publicProblemsOf;
};

/** The settings, for a plugin that declared "settings" in needs. */
export function from(host: Host): Settings | undefined
{
    return host.take<Settings>(NAME);
}

export { configFor };
export { publicProblemsOf as problemsOf, refusingSecrets } from "./internal/guard";
export type { BuildGuard, PublicOptions, ResolvedBuild } from "./internal/guard";
export { SettingsFault } from "./internal/faults";
export type { PluginConfig } from "./internal/config";
