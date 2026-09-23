export type Closable = {
    name: string;
    definition: { dependsOn?: readonly string[] | undefined };
};

export type FoundPlugin = {
    plugin: Closable;
    config?: unknown;
};

export type TestKernels = {
    resolve: (name: string) => FoundPlugin | undefined | Promise<FoundPlugin | undefined>;
};

type Configured = {
    resolve: TestKernels["resolve"];
    found: Map<string, FoundPlugin | undefined>;
};

let configured: Configured | undefined;

export function configure(fixture: TestKernels): void
{
    configured = { resolve: fixture.resolve, found: new Map() };
}

export function forget(): void
{
    configured = undefined;
}

export async function closeOver(
    plugins: readonly Closable[],
    config: Readonly<Record<string, unknown>> | undefined,
): Promise<{ plugins: readonly Closable[]; config: Readonly<Record<string, unknown>> | undefined }>
{
    const fixture = configured;

    if (fixture === undefined)
    {
        return { plugins, config };
    }

    const given = new Map(plugins.map((plugin) => [plugin.name, plugin]));
    const added = new Map<string, FoundPlugin>();
    const ordered: Closable[] = [];
    const placed = new Set<string>();

    const find = async (name: string): Promise<FoundPlugin | undefined> =>
    {
        if (!fixture.found.has(name))
        {
            fixture.found.set(name, await fixture.resolve(name));
        }

        return fixture.found.get(name);
    };

    const place = async (plugin: Closable): Promise<void> =>
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
