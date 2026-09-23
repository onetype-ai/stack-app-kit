import type { Context, Plugin } from "./contract";
import type { KernelOptions, LogFn } from "./kernel";

// The one plugin declaring grants answers what the viewer holds, read on every check; undefined when none does.
export function grantsFrom(order: readonly Plugin[], options: KernelOptions, contextOf: (plugin: string) => Context, log: LogFn): (() => readonly string[]) | undefined
{
    const source = order.find((plugin) => plugin.definition.grants !== undefined);

    if (source === undefined)
    {
        return undefined;
    }

    const declaredPermissions = new Set(
        order.flatMap((plugin) => Object.keys(plugin.definition.permissions ?? {})),
    );
    const warnedAbout = new Set<string>();

    // Replacement, not a merge, is deliberate: the granting plugin
    // holds the session, and merging would keep a permission alive
    // after sign-out. Saying so is what was missing -- an
    // application that passed both read its own permissions as
    // false with nothing anywhere to explain why.
    if (options.permissions !== undefined)
    {
        log(
            "warn",
            source.name,
            `"${source.name}" declares grants, so it answers what the viewer holds and the \`permissions\` passed to createKernel is never read. Pass one or the other.`,
        );
    }

    return () =>
    {
        const answered = source.definition.grants?.(contextOf(source.name)) ?? [];

        // grants is read on every check, so its answer cannot be
        // validated at startup the way a declaration is. A name no
        // plugin declares guards nothing, so it is dropped rather
        // than answered: has() saying yes to a permission nothing
        // checks is the shape a misspelling hides in.
        const held: string[] = [];

        for (const permission of answered)
        {
            if (declaredPermissions.has(permission))
            {
                held.push(permission);

                continue;
            }

            if (!warnedAbout.has(permission))
            {
                warnedAbout.add(permission);

                log(
                    "warn",
                    source.name,
                    `"${source.name}" granted "${permission}", which no plugin declares, so it was dropped. Declare it under the owning plugin's \`permissions\`, or correct the name.`,
                );
            }
        }

        return held;
    };
}
