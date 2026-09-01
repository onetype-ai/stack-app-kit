import { Fault } from "./errors";
import type { Plugin } from "./plugin";

/**
 * Sorts plugins so every one boots after the plugins it needs.
 *
 * Ties break by name, so one set always yields one order. A run that varied
 * would make what a plugin sees at boot depend on iteration order.
 */
export function order(known: ReadonlyMap<string, Plugin>): Plugin[]
{
    const sorted: Plugin[] = [];
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

        const plugin = known.get(name);

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
        sorted.push(plugin);
    }

    for (const name of [...known.keys()].sort())
    {
        walk(name);
    }

    return sorted;
}

/**
 * Names the loop, from where it was entered back to itself, so the message
 * points at the plugins to fix rather than at one of them.
 */
function loop(walking: readonly string[], name: string): string
{
    const at = walking.indexOf(name);

    return [...walking.slice(at === -1 ? 0 : at), name].join(" -> ");
}
