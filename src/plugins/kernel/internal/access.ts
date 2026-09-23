import type { Plugin, RegistryAccess } from "./contract";
import { KernelFault } from "./faults";
import type { permissions } from "./permissions";
import type { RegistryEntry, registries } from "./registries";

// How a plugin reaches a registry or pipeline: only its own or its dependencies' own, and a registry as the viewer sees it.
export function access(lists: ReturnType<typeof registries>, permits: ReturnType<typeof permissions>, byName: ReadonlyMap<string, Plugin>)
{
    const seen = new Map<string, { from: readonly RegistryEntry[]; version: number; visible: readonly RegistryEntry[] }>();
    let permitted = 0;

    permits.watch(() =>
    {
        permitted += 1;
    });

    // the same array back until an entry or a permission moved, so a React store reading it settles
    function visible(name: string): readonly RegistryEntry[]
    {
        const from = lists.list(name);
        const last = seen.get(name);

        if (last !== undefined && last.from === from && last.version === permitted)
        {
            return last.visible;
        }

        const answer = Object.freeze(from.filter((entry) => permits.all(entry.requires ?? [])));

        seen.set(name, { from, version: permitted, visible: answer });

        return answer;
    }

    function registryFor(plugin: string, name: string): RegistryAccess
    {
        reachable(plugin, lists.ownerOf(name), "registry", name);

        return {
            list: () => visible(name),
            set: (entry) => lists.add(plugin, name, entry),
        };
    }

    function reachable(plugin: string, owner: string | undefined, kind: string, name: string): void
    {
        if (owner === undefined)
        {
            throw new KernelFault(kind === "pipeline" ? "UNDECLARED_PIPELINE" : "UNDECLARED_REGISTRY", `"${plugin}" reached ${kind} "${name}", which no plugin declares. Declare it, or correct the name.`, { plugin });
        }

        if (owner !== plugin && !(byName.get(plugin)?.definition.dependsOn ?? []).includes(owner))
        {
            throw new KernelFault("UNDECLARED_DEPENDENCY", `${kind === "pipeline" ? "Pipeline" : "Registry"} "${name}" belongs to "${owner}", which "${plugin}" does not depend on. Add "${owner}" to dependsOn.`, { plugin });
        }
    }

    return { visible, registryFor, reachable };
}
