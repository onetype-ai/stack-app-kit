import type { Plugin } from "./contract";
import type { KernelFault } from "./faults";
import * as names from "./names";

/** One thing wrong, and everything needed to fix it. */
export type ContractProblem = {
    code: KernelFault["code"];
    plugin: string;
    message: string;
};

type Owned = {
    routes: Map<string, string>;
    slots: Map<string, string>;
    events: Map<string, string>;
    hooks: Map<string, string>;
    commands: Map<string, string>;
    permissions: Map<string, string>;
};

export function validate(plugins: readonly Plugin[], config: Readonly<Record<string, unknown>>, granted = false, grantedBy?: string): ContractProblem[]
{
    const problems: ContractProblem[] = [];
    const report = (code: KernelFault["code"], plugin: string, message: string): void =>
    {
        problems.push({ code, plugin, message });
    };

    const byName = new Map<string, Plugin>();

    for (const plugin of plugins)
    {
        if (byName.has(plugin.name))
        {
            report("DUPLICATE_PLUGIN", plugin.name, `Two plugins are named "${plugin.name}". A name is what everything else refers to, so it must be unique.`);

            continue;
        }

        byName.set(plugin.name, plugin);
    }

    const owned: Owned = {
        routes: new Map(),
        slots: new Map(),
        events: new Map(),
        hooks: new Map(),
        commands: new Map(),
        permissions: new Map(),
    };

    for (const [name, plugin] of byName)
    {
        checkOwn(name, plugin, owned, report);
    }

    for (const [name, plugin] of byName)
    {
        checkReferences(name, plugin, byName, owned, report);
        checkConfig(name, plugin, config, report);
    }

    checkCycles(byName, report);
    checkGrants(byName, report, granted, grantedBy);

    return problems;
}

function checkOwn(name: string, plugin: Plugin, owned: Owned, report: (code: KernelFault["code"], plugin: string, message: string) => void): void
{
    const claim = (
        kind: keyof Owned,
        key: string,
        code: KernelFault["code"],
        label: string,
    ): void =>
    {
        const owner = owned[kind].get(key);

        if (owner !== undefined)
        {
            report(code, name, `${label} "${key}" is already declared by "${owner}". Two plugins cannot own one name.`);

            return;
        }

        owned[kind].set(key, name);
    };

    for (const [key, one] of Object.entries(plugin.definition.permissions ?? {}))
    {
        if (checkNamespaced(name, key, "permission", report))
        {
            claim("permissions", key, "DUPLICATE_PERMISSION", "Permission");
        }

        void one;
    }

    for (const [key] of Object.entries(plugin.definition.emits ?? {}))
    {
        if (checkNamespaced(name, key, "event", report))
        {
            claim("events", key, "DUPLICATE_EVENT", "Event");
        }
    }

    for (const [key] of Object.entries(plugin.definition.hooks ?? {}))
    {
        if (checkNamespaced(name, key, "hook", report))
        {
            claim("hooks", key, "DUPLICATE_HOOK", "Hook");
        }
    }

    for (const [key, slot] of Object.entries(plugin.definition.slots ?? {}))
    {
        if (checkNamespaced(name, key, "slot", report))
        {
            claim("slots", key, "DUPLICATE_SLOT", "Slot");
        }

        // The shape, not only the name: a declaration missing the field that
        // does the work started clean and died on the first use, as a
        // TypeError naming no plugin.
        if (typeof (slot as { schema?: { safeParse?: unknown } } | undefined)?.schema?.safeParse !== "function")
        {
            report("UNDECLARED_SLOT", name, `Slot "${key}" declares no schema, so nothing checks what is passed to it. Add schema: z.object({ ... }).`);
        }
    }

    for (const [key, command] of Object.entries(plugin.definition.commands ?? {}))
    {
        if (checkNamespaced(name, key, "command", report))
        {
            claim("commands", key, "DUPLICATE_COMMAND", "Command");
        }

        const declared = command as { schema?: { safeParse?: unknown }; run?: unknown } | undefined;

        if (typeof declared?.schema?.safeParse !== "function")
        {
            report("UNDECLARED_COMMAND", name, `Command "${key}" declares no schema, so nothing checks what it is asked to do. Add schema: z.object({ ... }).`);
        }

        if (typeof declared?.run !== "function")
        {
            report("UNDECLARED_COMMAND", name, `Command "${key}" declares no run, so asking for it does nothing. Add run: (input, ctx) => ....`);
        }
    }

    for (const route of plugin.definition.routes ?? [])
    {
        if (!route.path.startsWith("/"))
        {
            report("INVALID_ROUTE", name, `Route path "${route.path}" must start with "/". A path in another syntax renders a 404 with nothing to explain it.`);

            continue;
        }

        if (/\s/.test(route.path))
        {
            report("INVALID_ROUTE", name, `Route path "${route.path}" contains whitespace.`);

            continue;
        }

        const owner = owned.routes.get(route.path);

        if (owner !== undefined)
        {
            report("DUPLICATE_ROUTE", name, `Route "${route.path}" is already declared by "${owner}". Which one renders would depend on order.`);

            continue;
        }

        owned.routes.set(route.path, name);
    }

    if (!/^\d+\.\d+\.\d+/.test(plugin.definition.version))
    {
        report("INVALID_NAME", name, `Version "${plugin.definition.version}" is not a version. Use major.minor.patch.`);
    }

    // typeof first: describe is required by the type and absent in plain JS or
    // past a cast, and reading .trim() off undefined killed the validator whose
    // whole job is answering with a refusal the caller can act on.
    if (typeof plugin.definition.describe !== "string" || plugin.definition.describe.trim() === "")
    {
        report("INVALID_NAME", name, "A plugin describes itself in one sentence. An empty description tells the next reader nothing.");
    }
}

function checkNamespaced(owner: string, key: string, kind: string, report: (code: KernelFault["code"], plugin: string, message: string) => void): boolean
{
    try
    {
        names.namespaced(key, kind, owner);

        return true;
    }
    catch (cause)
    {
        report("INVALID_NAME", owner, cause instanceof Error ? cause.message : String(cause));

        return false;
    }
}

function checkReferences(
    name: string,
    plugin: Plugin,
    byName: ReadonlyMap<string, Plugin>,
    owned: Owned,
    report: (code: KernelFault["code"], plugin: string, message: string) => void,
): void
{
    const declared = new Set(plugin.definition.dependsOn ?? []);

    for (const need of declared)
    {
        if (!byName.has(need))
        {
            report("UNKNOWN_DEPENDENCY", name, `"${name}" depends on "${need}", which no plugin provides. Pass it to createKernel, or remove it from dependsOn.`);
        }
    }

    const declaredSomewhere = (
        kind: keyof Owned,
        key: string,
        code: KernelFault["code"],
        label: string,
    ): void =>
    {
        if (owned[kind].get(key) === undefined)
        {
            report(code, name, `${label} "${key}" is not declared by any plugin. Declare it, or correct the name.`);
        }
    };

    const reach = (
        kind: keyof Owned,
        key: string,
        code: KernelFault["code"],
        label: string,
    ): void =>
    {
        const from = owned[kind].get(key);

        if (from === undefined)
        {
            report(code, name, `${label} "${key}" is not declared by any plugin. Declare it, or correct the name.`);

            return;
        }

        if (from !== name && !declared.has(from))
        {
            report("UNDECLARED_DEPENDENCY", name, `${label} "${key}" belongs to "${from}", which "${name}" does not depend on. Add "${from}" to dependsOn.`);
        }
    };

    for (const [key, listener] of Object.entries(plugin.definition.listens ?? {}))
    {
        reach("events", key, "UNDECLARED_EVENT", "Event");

        // A listener with no handle registered quietly and swallowed every
        // delivery into events.failures(), where nothing reads it.
        if (typeof (listener as { handle?: unknown } | undefined)?.handle !== "function")
        {
            report("UNDECLARED_EVENT", name, `Listening to "${key}" declares no handle, so the event arrives and nothing runs. Add handle: (payload, ctx) => ....`);
        }
    }

    for (const key of Object.keys(plugin.definition.participates ?? {}))
    {
        reach("hooks", key, "UNDECLARED_HOOK", "Hook");
    }

    for (const contribution of plugin.definition.contributes ?? [])
    {
        // reach, not declaredSomewhere: a contribution reads the payload the
        // slot's owner passes it, which is a shape that owner may change. The
        // dependency runs filler -> owner, so a shell still names no plugin.
        reach("slots", contribution.slot, "UNDECLARED_SLOT", "Slot");

        for (const permission of contribution.requires ?? [])
        {
            declaredSomewhere("permissions", permission, "UNDECLARED_PERMISSION", "Permission");
        }
    }

    for (const route of plugin.definition.routes ?? [])
    {
        for (const permission of route.requires ?? [])
        {
            reach("permissions", permission, "UNDECLARED_PERMISSION", "Permission");
        }
    }

    for (const command of Object.values(plugin.definition.commands ?? {}))
    {
        for (const permission of command.requires ?? [])
        {
            reach("permissions", permission, "UNDECLARED_PERMISSION", "Permission");
        }
    }
}

function checkConfig(
    name: string,
    plugin: Plugin,
    config: Readonly<Record<string, unknown>>,
    report: (code: KernelFault["code"], plugin: string, message: string) => void,
): void
{
    const schema = plugin.definition.config;

    if (schema === undefined)
    {
        return;
    }

    const answer = schema.safeParse(config[name] ?? {});

    if (!answer.success)
    {
        const issue = answer.error.issues[0];
        const atPath = issue === undefined || issue.path.length === 0 ? "" : ` at "${issue.path.join(".")}"`;

        report("INVALID_CONFIG", name, `Config for "${name}" is invalid${atPath}: ${issue?.message ?? "it does not match the schema"}.`);
    }
}

function checkGrants(byName: ReadonlyMap<string, Plugin>, report: (code: KernelFault["code"], plugin: string, message: string) => void, granted: boolean, grantedBy?: string): void
{
    const alone = (
        code: KernelFault["code"],
        what: string,
        plugin: (candidate: Plugin) => boolean,
    ): void =>
    {
        const sources = [...byName.values()].filter(plugin).map((each) => each.name);

        for (const name of sources.slice(1))
        {
            report(code, name, `"${name}" and "${sources[0] ?? ""}" both declare ${what}. One plugin owns it, or which one answers depends on the order they booted.`);
        }
    };

    alone("DUPLICATE_GRANTS", "grants", (plugin) => plugin.definition.grants !== undefined);

    // grants answers what the viewer holds, so any plugin declaring it decided
    // the whole authorization model. When the application names the one that
    // may, any other is refused. Left unnamed, the single granter is the
    // nominee: DUPLICATE_GRANTS refuses a second, and its own permissions are
    // held to its own prefix like any plugin's, so naming it adds nothing.
    for (const [name, plugin] of byName)
    {
        if (plugin.definition.grants === undefined)
        {
            continue;
        }

        if (grantedBy !== undefined && name !== grantedBy)
        {
            report("UNNOMINATED_GRANTS", name, `"${name}" declares grants, and this application named "${grantedBy}" as the one that may. A plugin granting itself permissions decides what every guard allows.`);
        }
    }
    alone("DUPLICATE_FRAME", "a frame", (plugin) => plugin.definition.frame !== undefined);
    alone("DUPLICATE_PAGE", "a 403 page", (plugin) => plugin.definition.pages?.forbidden !== undefined);
    alone("DUPLICATE_PAGE", "a 404 page", (plugin) => plugin.definition.pages?.missing !== undefined);

    // The granter named a closed set, so a guard outside it never lifts: the
    // page renders 403 forever and nothing says which permission was wrong.
    const granter = [...byName.values()].find((plugin) => plugin.definition.grants !== undefined);
    const supported = granter?.definition.grantsSupported;

    if (supported !== undefined)
    {
        if (supported.length === 0)
        {
            report("UNGRANTABLE_PERMISSION", granter?.name ?? "", `"${granter?.name ?? ""}" declares grantsSupported as an empty list, so it grants nothing and every guarded route and contribution is unreachable. Name the permissions it answers, or leave grantsSupported out.`);
        }
        else
        {
            const answerable = new Set(supported);

            for (const [name, plugin] of byName)
            {
                // Every guarded site, not only routes: a contribution that can
                // never render and a command that always refuses are the same
                // mistake, and were both starting clean.
                const guarded: [string, readonly string[]][] = [
                    ...(plugin.definition.routes ?? []).map((route) => [`Route "${route.path}"`, route.requires ?? []] as [string, readonly string[]]),
                    ...(plugin.definition.contributes ?? []).map((contribution) => [`The contribution to "${contribution.slot}"`, contribution.requires ?? []] as [string, readonly string[]]),
                    ...Object.entries(plugin.definition.commands ?? {}).map(([key, command]) => [`Command "${key}"`, command.requires ?? []] as [string, readonly string[]]),
                ];

                for (const [what, requires] of guarded)
                {
                    for (const permission of requires)
                    {
                        if (!answerable.has(permission))
                        {
                            report("UNGRANTABLE_PERMISSION", name, `${what} requires "${permission}", which "${granter?.name ?? ""}" never answers. Add it to grantsSupported, or nothing can reach it.`);
                        }
                    }
                }
            }
        }
    }

    if (!granted && [...byName.values()].every((plugin) => plugin.definition.grants === undefined))
    {
        for (const [name, plugin] of byName)
        {
            for (const route of plugin.definition.routes ?? [])
            {
                for (const permission of route.requires ?? [])
                {
                    report("UNGRANTABLE_PERMISSION", name, `Route "${route.path}" requires "${permission}", and no plugin grants anything. Declare grants, or drop the guard.`);
                }
            }
        }
    }
}

function checkCycles(byName: ReadonlyMap<string, Plugin>, report: (code: KernelFault["code"], plugin: string, message: string) => void): void
{
    const state = new Map<string, "open" | "done">();
    const walking: string[] = [];
    const reported = new Set<string>();

    function walk(name: string): void
    {
        if (state.get(name) === "done")
        {
            return;
        }

        if (state.get(name) === "open")
        {
            const seenAt = walking.indexOf(name);
            const loop = [...walking.slice(seenAt === -1 ? 0 : seenAt), name];
            const key = [...loop].sort().join(",");

            if (!reported.has(key))
            {
                reported.add(key);
                report("DEPENDENCY_CYCLE", name, `Plugins depend on each other in a loop: ${loop.join(" -> ")}. One of them has to stop.`);
            }

            return;
        }

        state.set(name, "open");
        walking.push(name);

        for (const need of [...(byName.get(name)?.definition.dependsOn ?? [])].sort())
        {
            if (byName.has(need))
            {
                walk(need);
            }
        }

        walking.pop();
        state.set(name, "done");
    }

    for (const name of [...byName.keys()].sort())
    {
        walk(name);
    }
}
