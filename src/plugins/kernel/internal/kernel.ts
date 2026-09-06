import type { Cache, Client, Context, FallbackProps, Pages, Plugin, Realtime, Route } from "./contract";
import { events, type Failure } from "./events";
import { KernelFault } from "./faults";
import { hooks } from "./hooks";
import { permissions, type Source } from "./permissions";
import { slots, type PlacedContribution } from "./slots";
import { validate } from "./validate";

import type { ComponentType, FunctionComponent } from "react";

/** Where a line goes. The application decides; a plugin never writes directly. */
export type Log = (
    level: "debug" | "info" | "warn" | "error",
    plugin: string,
    line: string,
    about?: Readonly<Record<string, unknown>>,
) => void;

/** What an application gives the kernel. */
export type Options = {
    plugins: readonly Plugin[];
    config?: Readonly<Record<string, unknown>>;
    http?: Client;
    cache?: Cache;
    realtime?: Realtime;
    permissions?: Source;
    log?: Log;
};

/** A route, and the plugin it came from. */
export type Registered = Route & {
    plugin: string;
    fallback: ComponentType<FallbackProps> | undefined;
};

/** What the application holds after createKernel. */
export type Kernel = {
    start: () => Promise<void>;
    stop: () => Promise<void>;
    started: () => boolean;

    routes: () => readonly Registered[];
    frame: () => FunctionComponent | undefined;
    pages: () => Pages;
    slot: (name: string, payload: unknown) => { contributions: readonly PlacedContribution[]; problem?: string };
    knownSlot: (name: string) => boolean;
    fallbackFor: (plugin: string) => ComponentType<FallbackProps> | undefined;

    context: (plugin: string) => Context;
    permissions: { has: (permission: string) => boolean; all: (permissions: readonly string[]) => boolean };
    events: { failures: () => readonly Failure[] };
    run: (command: string, input: unknown) => Promise<void>;
};

const quiet: Log = () => {};

/** What a missing dependency answers: a refusal naming what to pass. */
function missing(what: string, field: string): never
{
    throw new KernelFault(
        "NOT_STARTED",
        `A plugin used ctx.${field}, but no ${what} was given to createKernel. Pass one as \`${field}\`.`,
    );
}

const noClient: Client = {
    get: () =>
    {
        return missing("http client", "http");
    },
    post: () =>
    {
        return missing("http client", "http");
    },
    put: () =>
    {
        return missing("http client", "http");
    },
    patch: () =>
    {
        return missing("http client", "http");
    },
    delete: () =>
    {
        return missing("http client", "http");
    },
};

const noCache: Cache = {
    invalidate: () =>
    {
        return missing("cache", "cache");
    },
};

const noRealtime: Realtime = {
    channel: () =>
    {
        return "http";
    },

    // Answers a subscription that never delivers, on purpose: `channel()`
    // already said there is no socket, so a plugin polls instead. Refusing
    // here would make the absence of a socket an error rather than a state.
    subscribe: () => ({ close: () => {} }),
};

/**
 * Builds a kernel from what the application declared.
 *
 * Nothing runs here: `start` validates first, and either brings up every
 * plugin or throws. A half-started kernel behaves according to where it
 * stopped, which is not a state anyone can reason about.
 */
export function createKernel(options: Options): Kernel
{
    const config = options.config ?? {};
    const log = options.log ?? quiet;
    const http = options.http ?? noClient;
    const cache = options.cache ?? noCache;
    const realtime = options.realtime ?? noRealtime;

    const known = new Map(options.plugins.map((plugin) => [plugin.name, plugin]));
    const bus = events<Context>();
    const points = hooks<Context>();
    const places = slots();
    let granting: (() => readonly string[]) | undefined;

    const may = permissions({
        granted: () =>
        {
            return granting?.() ?? options.permissions?.granted() ?? [];
        },
    });
    const services = new Map<string, unknown>();
    const commands = new Map<string, {
        plugin: string;
        requires: readonly string[];
        run: (input: unknown, ctx: Context) => void | Promise<void>;
        schema: { safeParse: (value: unknown) => { success: boolean; data?: unknown; error?: { issues: { message: string }[] } } };
    }>();

    let running = false;
    let order: Plugin[] = [];

    // What each plugin's schema made of its section: defaults filled in, so a
    // plugin reads what it declared rather than what the application typed.
    const parsed = new Map<string, unknown>();

    /** What one plugin sees. Built per plugin, so `name` is its own. */
    function context(plugin: string): Context
    {
        return {
            name: plugin,
            config: parsed.get(plugin) ?? config[plugin],
            services: services.get(plugin),

            log: {
                debug: (line, about) =>
                {
                    log("debug", plugin, line, about);
                },
                info: (line, about) =>
                {
                    log("info", plugin, line, about);
                },
                warn: (line, about) =>
                {
                    log("warn", plugin, line, about);
                },
                error: (line, about) =>
                {
                    log("error", plugin, line, about);
                },
            },

            http,
            cache,
            realtime,

            events: {
                emit: (event, payload) =>
                {
                    bus.emit(plugin, event, payload, context);
                },

                on: (event, told) =>
                {
                    return bus.listen(plugin, event, {
                        describe: `${plugin} listening while it runs`,
                        handle: (payload) =>
                        {
                            told(payload);
                        },
                    });
                },
            },

            hooks: {
                run: (hook, payload) =>
                {
                    return points.run(plugin, hook, payload, context);
                },
            },

            permissions: may,

            commands: {
                run: (command, input) =>
                {
                    return run(command, input);
                },
            },

            use: <Api,>(name: string): Api =>
            {
                const declared = known.get(plugin)?.definition.dependsOn ?? [];

                if (name !== plugin && !declared.includes(name))
                {
                    throw new KernelFault(
                        "UNDECLARED_DEPENDENCY",
                        `"${plugin}" reached "${name}", which it does not depend on. Add "${name}" to dependsOn.`,
                        { plugin },
                    );
                }

                return services.get(name) as Api;
            },
        };
    }

    /** Runs a command, after its permission and its schema. */
    async function run(command: string, input: unknown): Promise<void>
    {
        if (!running)
        {
            throw new KernelFault(
                "NOT_STARTED",
                `Command "${command}" was run before the kernel started. Every plugin's setup runs first, so a command called from one is too early: reach the service directly instead.`,
            );
        }

        const declared = commands.get(command);

        if (declared === undefined)
        {
            throw new KernelFault("UNDECLARED_COMMAND", `Command "${command}" is not declared by any plugin.`);
        }

        const lacking = declared.requires.filter((permission) => !may.has(permission));

        if (lacking.length > 0)
        {
            throw new KernelFault(
                "PERMISSION_DENIED",
                `Command "${command}" needs ${lacking.map((permission) => `"${permission}"`).join(", ")}, which the viewer does not have.`,
                { plugin: declared.plugin, detail: { lacking } },
            );
        }

        const answer = declared.schema.safeParse(input);

        if (!answer.success)
        {
            throw new KernelFault(
                "INVALID_PAYLOAD",
                `The input for "${command}" does not match its schema: ${answer.error?.issues[0]?.message ?? "it was rejected"}.`,
                { plugin: declared.plugin },
            );
        }

        await declared.run(answer.data, context(declared.plugin));
    }

    return {
        started: () =>
        {
            return running;
        },

        async start(): Promise<void>
        {
            if (running)
            {
                return;
            }

            const problems = validate(options.plugins, config);

            if (problems.length > 0)
            {
                const lines = problems.map((problem) => `  - [${problem.code}] ${problem.plugin}: ${problem.message}`);

                throw new KernelFault(
                    problems[0]?.code ?? "INVALID_CONFIG",
                    `${problems.length} ${problems.length === 1 ? "problem" : "problems"} stopped the kernel from starting:\n${lines.join("\n")}`,
                    { plugin: problems[0]?.plugin ?? "", detail: { problems } },
                );
            }

            order = sorted(known);

            for (const plugin of order)
            {
                const schema = plugin.definition.config;

                if (schema !== undefined)
                {
                    parsed.set(plugin.name, schema.parse(config[plugin.name] ?? {}));
                }
            }

            // Declare everything before anything is wired: a listener may name
            // an event owned by a plugin that starts later.
            for (const plugin of order)
            {
                for (const [key, event] of Object.entries(plugin.definition.emits ?? {}))
                {
                    bus.declare(plugin.name, key, event);
                }

                for (const [key, hook] of Object.entries(plugin.definition.hooks ?? {}))
                {
                    points.declare(plugin.name, key, hook);
                }

                for (const [key, slot] of Object.entries(plugin.definition.slots ?? {}))
                {
                    places.declare(plugin.name, key, slot);
                }
            }

            for (const plugin of order)
            {
                services.set(plugin.name, plugin.definition.services?.(context(plugin.name) as never));

                for (const [key, listener] of Object.entries(plugin.definition.listens ?? {}))
                {
                    bus.listen(plugin.name, key, listener);
                }

                for (const [key, participant] of Object.entries(plugin.definition.participates ?? {}))
                {
                    points.participate(plugin.name, key, participant);
                }

                for (const filled of plugin.definition.contributes ?? [])
                {
                    places.fill(plugin.name, filled);
                }

                for (const [key, command] of Object.entries(plugin.definition.commands ?? {}))
                {
                    commands.set(key, {
                        plugin: plugin.name,
                        requires: command.requires ?? [],
                        run: command.run,
                        schema: command.schema,
                    });
                }
            }

            const source = order.find((plugin) => plugin.definition.grants !== undefined);

            if (source !== undefined)
            {
                granting = () =>
                {
                    return source.definition.grants?.(context(source.name)) ?? [];
                };
            }

            for (const plugin of order)
            {
                await plugin.definition.setup?.(context(plugin.name));
            }

            running = true;
        },

        async stop(): Promise<void>
        {
            for (const plugin of [...order].reverse())
            {
                try
                {
                    await plugin.definition.teardown?.(context(plugin.name));
                }
                catch (cause)
                {
                    log("error", plugin.name, "teardown threw", { cause });
                }
            }

            running = false;
        },

        routes: (): readonly Registered[] =>
            order.flatMap((plugin) =>
                (plugin.definition.routes ?? []).map((route) => ({
                    ...route,
                    plugin: plugin.name,
                    fallback: plugin.definition.fallback,
                })),
            ),

        frame: () =>
        {
            return order.find((plugin) => plugin.definition.frame !== undefined)?.definition.frame;
        },

        pages: () =>
        {
            const forbidden = order.find((plugin) => plugin.definition.pages?.forbidden !== undefined);
            const missing = order.find((plugin) => plugin.definition.pages?.missing !== undefined);

            return {
                ...(forbidden?.definition.pages?.forbidden !== undefined && {
                    forbidden: forbidden.definition.pages.forbidden,
                }),
                ...(missing?.definition.pages?.missing !== undefined && {
                    missing: missing.definition.pages.missing,
                }),
            };
        },

        slot: (name, payload) =>
        {
            return places.filled(name, payload);
        },

        knownSlot: (name) =>
        {
            return places.known(name);
        },

        fallbackFor: (plugin) =>
        {
            return known.get(plugin)?.definition.fallback;
        },

        context,

        permissions: may,

        events: { failures: bus.failures },

        run,
    };
}

/** Dependency order, ties broken by name so one set is always one order. */
function sorted(known: ReadonlyMap<string, Plugin>): Plugin[]
{
    const out: Plugin[] = [];
    const state = new Map<string, "open" | "done">();

    function walk(name: string): void
    {
        if (state.get(name) !== undefined)
        {
            return;
        }

        state.set(name, "open");

        const plugin = known.get(name);

        for (const need of [...(plugin?.definition.dependsOn ?? [])].sort())
        {
            if (known.has(need))
            {
                walk(need);
            }
        }

        state.set(name, "done");

        if (plugin !== undefined)
        {
            out.push(plugin);
        }
    }

    for (const name of [...known.keys()].sort())
    {
        walk(name);
    }

    return out;
}
