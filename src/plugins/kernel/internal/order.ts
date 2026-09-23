import type { Plugin } from "./contract";

// Each plugin after everything it depends on, ties by name, so a start is the same whatever order they were passed in.
export function inDependencyOrder(registry: ReadonlyMap<string, Plugin>): Plugin[]
{
    const ordered: Plugin[] = [];
    const state = new Map<string, "open" | "done">();

    function walk(name: string): void
    {
        if (state.get(name) !== undefined)
        {
            return;
        }

        state.set(name, "open");

        const plugin = registry.get(name);

        for (const need of [...(plugin?.definition.dependsOn ?? [])].sort())
        {
            if (registry.has(need))
            {
                walk(need);
            }
        }

        state.set(name, "done");

        if (plugin !== undefined)
        {
            ordered.push(plugin);
        }
    }

    for (const name of [...registry.keys()].sort())
    {
        walk(name);
    }

    return ordered;
}
