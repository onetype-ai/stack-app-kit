import type { Plugin } from "./contract";

/** One page as declared: where it lives, and what it takes to see it. */
export type DeclaredRoute = {
    readonly path: string;
    readonly title: string;
    readonly requires: readonly string[];

    /** Whether it redirects the viewer elsewhere before `requires` is asked. */
    readonly instead: boolean;
};

/** A name carrying a sentence, which is how events, hooks, slots and permissions read. */
export type DeclaredEntry = {
    readonly name: string;
    readonly describe: string;
};

/** One command, which unlike an event names what the caller must hold. */
export type DeclaredCommand = DeclaredEntry & {
    readonly requires: readonly string[];
};

/** One contribution: the slot it fills, and what it takes to be shown. */
export type DeclaredContribution = {
    readonly slot: string;
    readonly order?: number;
    readonly requires: readonly string[];
};

/** Everything one plugin declares, as data rather than source. */
export type Declaration = {
    readonly name: string;
    readonly version: string;
    readonly describe: string;
    readonly dependsOn: readonly string[];
    readonly routes: readonly DeclaredRoute[];
    readonly permissions: readonly DeclaredEntry[];
    readonly slots: readonly DeclaredEntry[];
    readonly contributes: readonly DeclaredContribution[];
    readonly emits: readonly DeclaredEntry[];
    readonly listens: readonly DeclaredEntry[];
    readonly hooks: readonly DeclaredEntry[];
    readonly participates: readonly DeclaredEntry[];
    readonly commands: readonly DeclaredCommand[];
    readonly frame: boolean;
    readonly pages: boolean;
    readonly fallback: boolean;
    readonly grants: boolean;
    readonly config: boolean;
    readonly services: boolean;
    readonly setup: boolean;
    readonly teardown: boolean;
};

// A record of describable things reads the same whether it holds events,
// hooks, slots or permissions, so one reader covers all four.
function entriesOf(held: unknown): DeclaredEntry[]
{
    if (held === undefined || held === null || typeof held !== "object")
    {
        return [];
    }

    return Object.entries(held as Record<string, { describe?: unknown }>)
        .map(([name, entry]) => ({
            name,
            describe: typeof entry?.describe === "string" ? entry.describe : "",
        }))
        .sort((first, second) => first.name.localeCompare(second.name));
}

function routesOf(declared: unknown): DeclaredRoute[]
{
    if (!Array.isArray(declared))
    {
        return [];
    }

    return declared.map((route: Record<string, unknown>) => ({
        path: typeof route["path"] === "string" ? route["path"] : "",
        title: typeof route["title"] === "string" ? route["title"] : "",
        requires: Array.isArray(route["requires"]) ? [...(route["requires"] as string[])] : [],
        instead: route["instead"] !== undefined,
    }));
}

function contributionsOf(declared: unknown): DeclaredContribution[]
{
    if (!Array.isArray(declared))
    {
        return [];
    }

    return declared.map((held: Record<string, unknown>) => ({
        slot: typeof held["slot"] === "string" ? held["slot"] : "",
        ...(typeof held["order"] === "number" ? { order: held["order"] } : {}),
        requires: Array.isArray(held["requires"]) ? [...(held["requires"] as string[])] : [],
    }));
}

function commandsOf(held: unknown): DeclaredCommand[]
{
    if (held === undefined || held === null || typeof held !== "object")
    {
        return [];
    }

    return Object.entries(held as Record<string, { describe?: unknown; requires?: unknown }>)
        .map(([name, command]) => ({
            name,
            describe: typeof command?.describe === "string" ? command.describe : "",
            requires: Array.isArray(command?.requires) ? [...(command.requires as string[])] : [],
        }))
        .sort((first, second) => first.name.localeCompare(second.name));
}

function declarationFor(plugin: Plugin): Declaration
{
    const definition = plugin.definition as unknown as Record<string, unknown>;

    return {
        name: plugin.name,
        version: typeof definition["version"] === "string" ? definition["version"] : "",
        describe: typeof definition["describe"] === "string" ? definition["describe"] : "",
        dependsOn: Array.isArray(definition["dependsOn"]) ? [...(definition["dependsOn"] as string[])] : [],
        routes: routesOf(definition["routes"]),
        permissions: entriesOf(definition["permissions"]),
        slots: entriesOf(definition["slots"]),
        contributes: contributionsOf(definition["contributes"]),
        emits: entriesOf(definition["emits"]),
        listens: entriesOf(definition["listens"]),
        hooks: entriesOf(definition["hooks"]),
        participates: entriesOf(definition["participates"]),
        commands: commandsOf(definition["commands"]),

        // whether it has one, not what it is: a component is not readable as data
        frame: definition["frame"] !== undefined,
        pages: definition["pages"] !== undefined,
        fallback: definition["fallback"] !== undefined,
        grants: definition["grants"] !== undefined,
        config: definition["config"] !== undefined,
        services: definition["services"] !== undefined,
        setup: definition["setup"] !== undefined,
        teardown: definition["teardown"] !== undefined,
    };
}

/** Reads what the given plugins declare; a name narrows it to that one. */
export function declarationsOf(plugins: readonly Plugin[], name?: string): Declaration[]
{
    return plugins
        .filter((plugin) => name === undefined || plugin.name === name)
        .map(declarationFor)
        .sort((first, second) => first.name.localeCompare(second.name));
}
