import type { Plugin } from "./contract";
import type { KernelFault } from "./faults";
import * as names from "./names";

/** One thing wrong, and everything needed to fix it. */
export type ImportViolation = {
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

/**
 * Checks every contract, and reports everything wrong rather than the first.
 *
 * An application with four mistakes should learn all four in one run rather
 * than in four runs, each ending at a different one.
 */
export function validate(plugins: readonly Plugin[], config: Readonly<Record<string, unknown>>): ImportViolation[]
{
    const wrong: ImportViolation[] = [];
    const say = (code: KernelFault["code"], plugin: string, message: string): void =>
    {
        wrong.push({ code, plugin, message });
    };

    const by = new Map<string, Plugin>();

    for (const plugin of plugins)
    {
        if (by.has(plugin.name))
        {
            say("DUPLICATE_PLUGIN", plugin.name, `Two plugins are named "${plugin.name}". A name is what everything else refers to, so it must be unique.`);

            continue;
        }

        by.set(plugin.name, plugin);
    }

    const owned: Owned = {
        routes: new Map(),
        slots: new Map(),
        events: new Map(),
        hooks: new Map(),
        commands: new Map(),
        permissions: new Map(),
    };

    // First pass: what each plugin declares, and what it collides with.
    for (const [name, plugin] of by)
    {
        declares(name, plugin, owned, say);
    }

    // Second pass: what each plugin refers to. Everything declared is known
    // by now, so an order-dependent answer is impossible.
    for (const [name, plugin] of by)
    {
        refers(name, plugin, by, owned, say);
        settings(name, plugin, config, say);
    }

    cycles(by, say);
    granting(by, say);

    return wrong;
}

/** What a plugin declares, and whether anyone claimed it first. */
function declares(name: string, plugin: Plugin, owned: Owned, say: (code: KernelFault["code"], plugin: string, message: string) => void): void
{
    const claim = (
        kind: keyof Owned,
        key: string,
        code: KernelFault["code"],
        label: string,
    ): void =>
    {
        const first = owned[kind].get(key);

        if (first !== undefined)
        {
            say(code, name, `${label} "${key}" is already declared by "${first}". Two plugins cannot own one name.`);

            return;
        }

        owned[kind].set(key, name);
    };

    for (const [key, one] of Object.entries(plugin.definition.permissions ?? {}))
    {
        if (named(name, key, "permission", say))
        {
            claim("permissions", key, "DUPLICATE_PERMISSION", "Permission");
        }

        void one;
    }

    for (const [key] of Object.entries(plugin.definition.emits ?? {}))
    {
        if (named(name, key, "event", say))
        {
            claim("events", key, "DUPLICATE_EVENT", "Event");
        }
    }

    for (const [key] of Object.entries(plugin.definition.hooks ?? {}))
    {
        if (named(name, key, "hook", say))
        {
            claim("hooks", key, "DUPLICATE_HOOK", "Hook");
        }
    }

    for (const [key] of Object.entries(plugin.definition.slots ?? {}))
    {
        if (named(name, key, "slot", say))
        {
            claim("slots", key, "DUPLICATE_SLOT", "Slot");
        }
    }

    for (const [key] of Object.entries(plugin.definition.commands ?? {}))
    {
        if (named(name, key, "command", say))
        {
            claim("commands", key, "DUPLICATE_COMMAND", "Command");
        }
    }

    for (const route of plugin.definition.routes ?? [])
    {
        if (!route.path.startsWith("/"))
        {
            say("INVALID_ROUTE", name, `Route path "${route.path}" must start with "/". A path in another syntax renders a 404 with nothing to explain it.`);

            continue;
        }

        if (/\s/.test(route.path))
        {
            say("INVALID_ROUTE", name, `Route path "${route.path}" contains whitespace.`);

            continue;
        }

        const first = owned.routes.get(route.path);

        if (first !== undefined)
        {
            say("DUPLICATE_ROUTE", name, `Route "${route.path}" is already declared by "${first}". Which one renders would depend on order.`);

            continue;
        }

        owned.routes.set(route.path, name);
    }

    if (!/^\d+\.\d+\.\d+/.test(plugin.definition.version))
    {
        say("INVALID_NAME", name, `Version "${plugin.definition.version}" is not a version. Use major.minor.patch.`);
    }

    if (plugin.definition.describe.trim() === "")
    {
        say("INVALID_NAME", name, "A plugin describes itself in one sentence. An empty description tells the next reader nothing.");
    }
}

/** Checks one namespaced name, reporting rather than throwing. */
function named(owner: string, key: string, kind: string, say: (code: KernelFault["code"], plugin: string, message: string) => void): boolean
{
    try
    {
        names.namespaced(key, kind, owner);

        return true;
    }
    catch (cause)
    {
        say("INVALID_NAME", owner, cause instanceof Error ? cause.message : String(cause));

        return false;
    }
}

/** What a plugin refers to: it must exist, and be reachable. */
function refers(
    name: string,
    plugin: Plugin,
    by: ReadonlyMap<string, Plugin>,
    owned: Owned,
    say: (code: KernelFault["code"], plugin: string, message: string) => void,
): void
{
    const declared = new Set(plugin.definition.dependsOn ?? []);

    for (const need of declared)
    {
        if (!by.has(need))
        {
            say("UNKNOWN_DEPENDENCY", name, `"${name}" depends on "${need}", which no plugin provides. Pass it to createKernel, or remove it from dependsOn.`);
        }
    }

    /** Everything referred to is declared somewhere, and owned by us or by something we depend on. */
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
            say(code, name, `${label} "${key}" is not declared by any plugin. Declare it, or correct the name.`);

            return;
        }

        if (from !== name && !declared.has(from))
        {
            say("UNDECLARED_DEPENDENCY", name, `${label} "${key}" belongs to "${from}", which "${name}" does not depend on. Add "${from}" to dependsOn.`);
        }
    };

    for (const key of Object.keys(plugin.definition.listens ?? {}))
    {
        reach("events", key, "UNDECLARED_EVENT", "Event");
    }

    for (const key of Object.keys(plugin.definition.participates ?? {}))
    {
        reach("hooks", key, "UNDECLARED_HOOK", "Hook");
    }

    for (const contribution of plugin.definition.contributes ?? [])
    {
        reach("slots", contribution.slot, "UNDECLARED_SLOT", "Slot");

        for (const permission of contribution.requires ?? [])
        {
            reach("permissions", permission, "UNDECLARED_PERMISSION", "Permission");
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

/** Config is parsed by the plugin's own schema, where it enters. */
function settings(
    name: string,
    plugin: Plugin,
    config: Readonly<Record<string, unknown>>,
    say: (code: KernelFault["code"], plugin: string, message: string) => void,
): void
{
    const schema = plugin.definition.config;

    if (schema === undefined)
    {
        return;
    }

    // A plugin whose every key has a default is satisfied by nothing at all,
    // so an absent section parses as {} rather than as undefined. Refusing it
    // would make every application write an empty object per plugin.
    const answer = schema.safeParse(config[name] ?? {});

    if (!answer.success)
    {
        const first = answer.error.issues[0];
        const at = first === undefined || first.path.length === 0 ? "" : ` at "${first.path.join(".")}"`;

        say("INVALID_CONFIG", name, `Config for "${name}" is invalid${at}: ${first?.message ?? "it does not match the schema"}.`);
    }
}

/** What only one plugin may own, because two answers is no answer. */
function granting(by: ReadonlyMap<string, Plugin>, say: (code: KernelFault["code"], plugin: string, message: string) => void): void
{
    const alone = (
        code: KernelFault["code"],
        what: string,
        plugin: (one: Plugin) => boolean,
    ): void =>
    {
        const sources = [...by.values()].filter(plugin).map((each) => each.name);

        for (const name of sources.slice(1))
        {
            say(code, name, `"${name}" and "${sources[0] ?? ""}" both declare ${what}. One plugin owns it, or which one answers depends on the order they booted.`);
        }
    };

    alone("DUPLICATE_GRANTS", "grants", (plugin) => plugin.definition.grants !== undefined);
    alone("DUPLICATE_FRAME", "a frame", (plugin) => plugin.definition.frame !== undefined);
    alone("DUPLICATE_PAGE", "a 403 page", (plugin) => plugin.definition.pages?.forbidden !== undefined);
    alone("DUPLICATE_PAGE", "a 404 page", (plugin) => plugin.definition.pages?.missing !== undefined);
}

/** A cycle in dependsOn, named from where it was entered back to itself. */
function cycles(by: ReadonlyMap<string, Plugin>, say: (code: KernelFault["code"], plugin: string, message: string) => void): void
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
            const at = walking.indexOf(name);
            const loop = [...walking.slice(at === -1 ? 0 : at), name];
            const key = [...loop].sort().join(",");

            if (!reported.has(key))
            {
                reported.add(key);
                say("DEPENDENCY_CYCLE", name, `Plugins depend on each other in a loop: ${loop.join(" -> ")}. One of them has to stop.`);
            }

            return;
        }

        state.set(name, "open");
        walking.push(name);

        for (const need of [...(by.get(name)?.definition.dependsOn ?? [])].sort())
        {
            if (by.has(need))
            {
                walk(need);
            }
        }

        walking.pop();
        state.set(name, "done");
    }

    for (const name of [...by.keys()].sort())
    {
        walk(name);
    }
}
