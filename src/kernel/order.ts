import { BootFault } from "./errors";
import type { HostPlugin } from "./plugin";

export function order(plugins: ReadonlyMap<string, HostPlugin>): HostPlugin[]
{
    const ordered: HostPlugin[] = [];
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
            throw new BootFault("CYCLE", `plugins need each other in a loop: ${loop(walking, name)}.`);
        }

        const plugin = plugins.get(name);

        if (plugin === undefined)
        {
            throw new BootFault("UNKNOWN_NEED", `no plugin provides "${name}".`);
        }

        state.set(name, "open");
        walking.push(name);

        for (const need of [...(plugin.needs ?? [])].sort())
        {
            if (need === name)
            {
                throw new BootFault("CYCLE", `"${name}" needs itself.`, name);
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
    const seenAt = walking.indexOf(name);

    return [...walking.slice(seenAt === -1 ? 0 : seenAt), name].join(" -> ");
}
