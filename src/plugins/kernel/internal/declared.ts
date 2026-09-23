import type { Pipeline, PipelineStep, Plugin } from "./contract";
import { resolve } from "./pipelines";

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

/** One registry: its sentence, and the field that names each entry. */
export type DeclaredRegistry = DeclaredEntry & {
    readonly key: string;
};

/** What one plugin adds at start to one registry. */
export type DeclaredAddition = {
    readonly registry: string;
    readonly keys: readonly string[];
};

/** One pipeline and the order its steps run in, across the plugins read together; `problems` is what start would refuse. */
export type DeclaredPipeline = DeclaredEntry & {
    readonly steps: readonly { readonly id: string; readonly owner: string }[];
    readonly problems: readonly string[];
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
    readonly registries: readonly DeclaredRegistry[];
    readonly adds: readonly DeclaredAddition[];
    readonly pipelines: readonly DeclaredPipeline[];
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

function registriesOf(held: unknown): DeclaredRegistry[]
{
    return entriesOf(held).map((entry) =>
    {
        const key = (held as Record<string, { key?: unknown }>)[entry.name]?.key;

        return { ...entry, key: typeof key === "string" ? key : "" };
    });
}

// Entries are read by the key their registry declares, which this plugin's own declaration does not know; "id" and "name" cover what reads as data.
function additionsOf(held: unknown): DeclaredAddition[]
{
    if (held === undefined || held === null || typeof held !== "object")
    {
        return [];
    }

    return Object.entries(held as Record<string, unknown>)
        .map(([registry, entries]) => ({
            registry,
            keys: (Array.isArray(entries) ? entries : []).map((entry: Record<string, unknown> | null) =>
            {
                const named = entry?.["id"] ?? entry?.["name"];

                return typeof named === "string" ? named : "";
            }),
        }))
        .sort((first, second) => first.registry.localeCompare(second.registry));
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

function pipelinesOf(plugin: Plugin, all: readonly Plugin[]): DeclaredPipeline[]
{
    return entriesOf(plugin.definition.pipelines).map((entry) =>
    {
        const pipeline = (plugin.definition.pipelines ?? {})[entry.name] as Pipeline;
        const added = all.flatMap((other) => ((other.definition.adds ?? {})[entry.name] ?? []).map((step) => ({ plugin: other.name, step: step as PipelineStep })));
        const answer = resolve(entry.name, plugin.name, { ...pipeline, steps: Array.isArray(pipeline?.steps) ? pipeline.steps : [] }, added);

        return { ...entry, steps: answer.placed.map(({ id, owner }) => ({ id, owner })), problems: answer.problems };
    });
}

function declarationFor(plugin: Plugin, all: readonly Plugin[]): Declaration
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
        registries: registriesOf(definition["registries"]),
        adds: additionsOf(definition["adds"]),
        pipelines: pipelinesOf(plugin, all),
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
        .map((plugin) => declarationFor(plugin, plugins))
        .sort((first, second) => first.name.localeCompare(second.name));
}
