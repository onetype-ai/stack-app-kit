import { Fault } from "./errors";
import type { Plugin } from "./plugin";

export function order(plugins: ReadonlyMap<string, Plugin>): Plugin[]
{
    const ordered: Plugin[] = [];
    const state = new Map<string, "open" | "done">();
    const walking: string[] = [];

    function walk(name: string): void
    {
        if (state.get(name) === "done")
        {
            return;
        }

        if (state.get(name) === "open")
        {
            throw new Fault("CYCLE", `plugins need each other in a loop: ${loop(walking, name)}.`);
        }

        const plugin = plugins.get(name);

        if (plugin === undefined)
        {
            throw new Fault("UNKNOWN_NEED", `no plugin provides "${name}".`);
        }

        state.set(name, "open");
        walking.push(name);

        for (const need of [...(plugin.needs ?? [])].sort())
        {
            if (need === name)
            {
                throw new Fault("CYCLE", `"${name}" needs itself.`, name);
            }

            walk(need);
        }

        walking.pop();
        state.set(name, "done");
        ordered.push(plugin);
    }

    for (const name of [...plugins.keys()].sort())
    {
        walk(name);
    }

    return ordered;
}

function loop(walking: readonly string[], name: string): string
{
    const at = walking.indexOf(name);

    return [...walking.slice(at === -1 ? 0 : at), name].join(" -> ");
}
