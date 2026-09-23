import type { Context, Plugin } from "./contract";
import { KernelFault } from "./faults";
import type { LogFn } from "./kernel";

// What start can only check once every setup ran: what the plugins send and who may run their commands.

export function warnUngated(order: readonly Plugin[], log: LogFn): void
{
    // A command naming no permission runs for anyone holding an
    // account. Routes get UNGRANTABLE_PERMISSION and a 403 page;
    // commands had neither, and an omission carries no signal.
    const ungated = order
        .flatMap((plugin) => Object.entries(plugin.definition.commands ?? {}).map(([command, declared]) => ({ plugin: plugin.name, command, declared })))
        .filter(({ declared }) => (declared.requires ?? []).length === 0)
        .map(({ plugin, command }) => `${plugin}: ${command}`);

    if (ungated.length > 0)
    {
        log("warn", "kernel", "COMMANDS ANY VIEWER MAY RUN", {
            meaning: "these name no permission, so every viewer may run them",
            commands: ungated,
            turnOn: "declare requires: [...] on each, or leave it if anyone really may",
        });
    }
}

export function refuseSharedHeaders(order: readonly Plugin[], contextOf: (plugin: string) => Context): void
{
    // sends reads ctx.services, so it cannot run before setup — but it
    // can run here, where a clash costs a boot rather than the first
    // request that happened to need a header.
    const wroteHeader = new Map<string, string>();

    for (const plugin of order)
    {
        for (const name of Object.keys(plugin.definition.sends?.(contextOf(plugin.name)) ?? {}))
        {
            const wrote = wroteHeader.get(name.toLowerCase());

            if (wrote !== undefined)
            {
                throw new KernelFault(
                    "DUPLICATE_HEADER",
                    `"${plugin.name}" and "${wrote}" both send "${name}". One plugin owns a header, or which one answers depends on the order they booted.`,
                    { plugin: plugin.name },
                );
            }

            wroteHeader.set(name.toLowerCase(), plugin.name);
        }
    }
}
