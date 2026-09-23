import type { Plugin } from "../../kernel/api";

/** A plugin a test did not name, and the config it boots with; config is only ever given to a plugin the closure added. */
export type FoundPlugin = {
    plugin: Plugin;
    config?: unknown;
};

/** Where the plugins a test did not name come from. `resolve` runs once per name, only for one nothing given provides. */
export type TestKernels = {
    resolve: (name: string) => FoundPlugin | undefined | Promise<FoundPlugin | undefined>;
};

type Configured = {
    resolve: TestKernels["resolve"];
    found: Map<string, FoundPlugin | undefined>;
};

let configured: Configured | undefined;

/**
 * Set once per test process (a setup file). From then on `start` adds every plugin the given ones depend on,
 * transitively: a plugin the test passed wins by name, so a stand-in stays one, dependencies come first, and
 * otherwise the given order holds. A name nothing provides is still refused as UNKNOWN_DEPENDENCY.
 * Never called, `start` boots exactly what it was given. Only `./testing` exports it.
 */
export function configureTestKernels(fixture: TestKernels): void
{
    configured = { resolve: fixture.resolve, found: new Map() };
}

/** Forgets what `configureTestKernels` set, so `start` boots exactly what it is given again. */
export function resetTestKernels(): void
{
    configured = undefined;
}

export async function closeOver(
    plugins: readonly Plugin[],
    config: Readonly<Record<string, unknown>> | undefined,
): Promise<{ plugins: readonly Plugin[]; config: Readonly<Record<string, unknown>> | undefined }>
{
    const fixture = configured;

    if (fixture === undefined)
    {
        return { plugins, config };
    }

    const given = new Map(plugins.map((plugin) => [plugin.name, plugin]));
    const added = new Map<string, FoundPlugin>();
    const ordered: Plugin[] = [];
    const placed = new Set<string>();

    const find = async (name: string): Promise<FoundPlugin | undefined> =>
    {
        if (!fixture.found.has(name))
        {
            fixture.found.set(name, await fixture.resolve(name));
        }

        return fixture.found.get(name);
    };

    const place = async (plugin: Plugin): Promise<void> =>
    {
        if (placed.has(plugin.name))
        {
            return;
        }

        placed.add(plugin.name);

        for (const need of plugin.definition.dependsOn ?? [])
        {
            const known = given.get(need) ?? added.get(need)?.plugin;

            if (known !== undefined)
            {
                await place(known);

                continue;
            }

            const found = await find(need);

            if (found === undefined)
            {
                continue;
            }

            added.set(need, found);
            await place(found.plugin);
        }

        ordered.push(plugin);
    };

    for (const plugin of plugins)
    {
        await place(plugin);
    }

    if (added.size === 0)
    {
        return { plugins: ordered, config };
    }

    const withAdded: Record<string, unknown> = { ...config };

    for (const [name, found] of added)
    {
        if (withAdded[name] === undefined && found.config !== undefined)
        {
            withAdded[name] = found.config;
        }
    }

    return { plugins: ordered, config: withAdded };
}

/** The same closure over dependsOn, for a test building its kernel with `createKernel` rather than `start`. */
export async function withDependencies(plugins: readonly Plugin[]): Promise<readonly Plugin[]>
{
    return (await closeOver(plugins, undefined)).plugins;
}
