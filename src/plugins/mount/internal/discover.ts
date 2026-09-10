import type { Plugin } from "../../kernel/api";

/** What a bundler's eager glob returns. */
export type PluginModules = Readonly<Record<string, { default?: Plugin }>>;

/** The plugins a bundler found, sorted by name. */
export function discover(modules: PluginModules): Plugin[]
{
    return Object.entries(modules)
        .map(([path, module]) =>
        {
            if (module.default === undefined)
            {
                throw new Error(`${path} must default-export a definePlugin(...) result.`);
            }

            return module.default;
        })
        .sort((first, second) => first.name.localeCompare(second.name));
}
