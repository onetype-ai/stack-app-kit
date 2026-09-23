import { createLocale, localeProblems } from "./locale";
import type { LocaleOptions } from "./locale";
import type { Cache, HttpClient, Context, FallbackProps, Pages, Plugin, Realtime, Route } from "./contract";
import { events, type ListenerFailure } from "./events";
import { KernelFault } from "./faults";
import { hooks } from "./hooks";
import { permissions, type PermissionSource } from "./permissions";
import { slots, type MountedContribution } from "./slots";
import { validate } from "./validate";

import type { ComponentType, FunctionComponent, ReactNode } from "react";

/** Where a line goes. The application decides; a plugin never writes directly. */
export type LogFn = (
    level: "debug" | "info" | "warn" | "error",
    plugin: string,
    line: string,
    about?: Readonly<Record<string, unknown>>,
) => void;

/** What an application gives the kernel. */
export type KernelOptions = {
    plugins: readonly Plugin[];
    config?: Readonly<Record<string, unknown>>;
    /** Without `upload`, ctx.http.upload refuses, naming what to give. */
    http?: Omit<HttpClient, "upload"> & Partial<Pick<HttpClient, "upload">>;
    /** Without `clear`, ctx.cache.clear() refuses, naming what to give. */
    cache?: Omit<Cache, "clear" | "prefetch"> & Partial<Pick<Cache, "clear" | "prefetch">>;
    /** Without `reconnect`, the kernel answers one that does nothing. */
    realtime?: Omit<Realtime, "reconnect"> & Partial<Pick<Realtime, "reconnect">>;
    permissions?: PermissionSource;

    /** Which plugin may answer what the viewer holds; any other declaring `grants` is refused. Left out, the one plugin declaring `grants` is that plugin, and may own permissions under its own name. */
    grantedBy?: string;
    log?: LogFn;

    /** The locales plugins' messages are in; `en` alone when left out. */
    locale?: LocaleOptions;
};

/** A route, and the plugin it came from. */
export type RegisteredRoute = Route & {
    plugin: string;
    fallback: ComponentType<FallbackProps> | undefined;
};

/** What the application holds after createKernel. */
export type Kernel = {
    start: () => Promise<void>;
    stop: () => Promise<void>;
    started: () => boolean;

    routes: () => readonly RegisteredRoute[];

    /** The plugins this kernel started, for a caller reading what they declare. */
    plugins: () => readonly Plugin[];
    frame: () => FunctionComponent<{ children?: ReactNode }> | undefined;
    pages: () => Pages;
    slot: (name: string, payload: unknown) => { contributions: readonly MountedContribution[]; payload: unknown; problem?: string };
    hasSlot: (name: string) => boolean;
    fallbackFor: (plugin: string) => ComponentType<FallbackProps> | undefined;

    context: (plugin: string) => Context;
    permissions: {
        has: (permission: string) => boolean;
        all: (permissions: readonly string[]) => boolean;

        changed: () => void;

        watch: (notify: () => void) => () => void;
    };
    events: { failures: () => readonly ListenerFailure[] };
    run: (command: string, input: unknown) => Promise<void>;

    /** The viewer's locale for the whole application: what a page renders in, and what `html lang` says. */
    locale: {
        current: () => string;
        change: (tag: string) => void;
        watch: (notify: () => void) => () => void;
    };

    sent: () => Readonly<Record<string, string>>;
};

const quiet: LogFn = () => {};

function missing(what: string, field: string): never
{
    throw new KernelFault(
        "NOT_STARTED",
        `A plugin used ctx.${field}, but no ${what} was given to createKernel. Pass one as \`${field}\`.`,
    );
}

const noClient: HttpClient = {
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
    upload: () =>
    {
        return missing("http client", "http");
    },
};

const noCache: Cache = {
    invalidate: () =>
    {
        return missing("cache", "cache");
    },

    clear: () =>
    {
        return missing("cache", "cache");
    },

    prefetch: () =>
    {
        return missing("cache", "cache");
    },
};

const noRealtime: Realtime = {
    channel: () =>
    {
        return "http";
    },

    // a subscription that returns quietly looks live and delivers nothing
    subscribe: () =>
    {
        return missing("realtime", "realtime");
    },

    reconnect: () => {},
};

/** Builds a kernel from what the application declared. */
export function createKernel(options: KernelOptions): Kernel
{
    const config = options.config ?? {};
    const log = options.log ?? quiet;
    const givenHttp = options.http ?? noClient;
    const http: HttpClient = {
        get: (path, request) => givenHttp.get(path, request),
        post: (path, request) => givenHttp.post(path, request),
        put: (path, request) => givenHttp.put(path, request),
        patch: (path, request) => givenHttp.patch(path, request),
        delete: (path, request) => givenHttp.delete(path, request),
        upload: (path, body, request) =>
        {
            if (givenHttp.upload === undefined)
            {
                throw new KernelFault("NOT_STARTED", "A plugin used ctx.http.upload(), and the http client given to createKernel has no upload. Give one that uploads, as start does.");
            }

            return givenHttp.upload(path, body, request);
        },
    };
    const localeOptions: LocaleOptions = options.locale ?? { supported: ["en"], fallback: "en" };
    const locales = createLocale(localeOptions, (message) =>
    {
        throw new KernelFault("INVALID_CONFIG", `locale: ${message}`);
    });
    const givenCache = options.cache ?? noCache;
    const cache: Cache = {
        invalidate: (key) =>
        {
            givenCache.invalidate(key);
        },
        clear: () =>
        {
            if (givenCache.clear === undefined)
            {
                throw new KernelFault("NOT_STARTED", "A plugin used ctx.cache.clear(), and the cache given to createKernel has no clear. Give one that drops every entry, as cache.fromQueries does.");
            }

            givenCache.clear();
        },
        prefetch: (key, fetch) =>
        {
            if (givenCache.prefetch === undefined)
            {
                throw new KernelFault("NOT_STARTED", "A plugin used ctx.cache.prefetch(), and the cache given to createKernel has no prefetch. Give one that fetches into itself, as cache.fromQueries does.");
            }

            return givenCache.prefetch(key, fetch);
        },
    };
    const givenRealtime = options.realtime ?? noRealtime;
    const realtime: Realtime = {
        channel: () => givenRealtime.channel(),
        subscribe: (topic, receive, refused) => givenRealtime.subscribe(topic, receive, refused),
        reconnect: () =>
        {
            givenRealtime.reconnect?.();
        },
    };

    const registry = new Map(options.plugins.map((plugin) => [plugin.name, plugin]));
    const bus = events<Context>(Date.now, (failure) =>
    {
        log("error", failure.plugin, `listening to "${failure.event}" failed`, { cause: failure.error instanceof Error ? failure.error.message : String(failure.error) });
    });
    const points = hooks<Context>();
    const places = slots();
    let readGranted: (() => readonly string[]) | undefined;

    const permits = permissions({
        granted: () =>
        {
            // the granting plugin holds the session, so it answers rather than
            // merging: a merge would keep a permission alive after sign-out
            const held = readGranted?.() ?? options.permissions?.granted() ?? [];

            // A string here is iterated by character, so "notes.read" grants
            // "n", "o", "t" and nothing else. Only an array of strings counts.
            return Array.isArray(held) ? held.filter((each) => typeof each === "string") : [];
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
    let stopped = false;

    // start() fills these; leaving them means a restart registers twice and a
    // listener keeps firing against state its teardown released.
    const clear = (): void =>
    {
        bus.reset();
        points.reset();
        places.reset();
        services.clear();
        commands.clear();
        parsed.clear();
        order = [];
        readGranted = undefined;
        running = false;
    };
    let order: Plugin[] = [];

    const parsed = new Map<string, unknown>();

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
                    // stop() clears the registries, so without this the refusal
                    // would name a missing declaration rather than the real cause
                    if (!running)
                    {
                        throw new KernelFault(
                            "NOT_STARTED",
                            `"${plugin}" emitted "${event}" while the kernel was not running.`,
                        );
                    }

                    bus.emit(plugin, event, payload, context);
                },

                on: (event, handle) =>
                {
                    return bus.listen(plugin, event, {
                        describe: `${plugin} listening while it runs`,
                        handle: (payload) =>
                        {
                            handle(payload);
                        },
                    }, (owner) => owner === plugin || (registry.get(plugin)?.definition.dependsOn ?? []).includes(owner));
                },
            },

            hooks: {
                run: (hook, payload) =>
                {
                    return points.run(plugin, hook, payload, context);
                },
            },

            permissions: permits,

            commands: {
                run: (command, input) =>
                {
                    return run(command, input);
                },
            },

            locale: locales.forPlugin(registry.get(plugin)?.definition.messages),

            session: {
                changed: () =>
                {
                    options.cache?.clear?.();

                    permits.changed();
                    realtime.reconnect();
                },
            },

            use: <Api,>(name: string): Api =>
            {
                const declared = registry.get(plugin)?.definition.dependsOn ?? [];

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

        const lacking = declared.requires.filter((permission) => !permits.has(permission));

        if (lacking.length > 0)
        {
            throw new KernelFault(
                "PERMISSION_DENIED",
                `Command "${command}" needs ${lacking.map((permission) => `"${permission}"`).join(", ")}, which the viewer does not have. This is a UI guard, not authorization: the server must refuse it too.`,
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

            const problems = [
                ...validate(options.plugins, config, options.permissions !== undefined, options.grantedBy),
                ...options.plugins.flatMap((plugin) => localeProblems(plugin.name, plugin.definition.messages, localeOptions)
                    .map((message) => ({ code: "INVALID_CONFIG" as const, plugin: plugin.name, message }))),
            ];

            if (problems.length > 0)
            {
                const lines = problems.map((problem) => `  - [${problem.code}] ${problem.plugin}: ${problem.message}`);

                throw new KernelFault(
                    problems[0]?.code ?? "INVALID_CONFIG",
                    `${problems.length} ${problems.length === 1 ? "problem" : "problems"} stopped the kernel from starting:\n${lines.join("\n")}`,
                    { plugin: problems[0]?.plugin ?? "", detail: { problems } },
                );
            }

            order = inDependencyOrder(registry);

            for (const plugin of order)
            {
                const schema = plugin.definition.config;

                if (schema !== undefined)
                {
                    parsed.set(plugin.name, schema.parse(config[plugin.name] ?? {}));
                }
            }

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

                for (const contribution of plugin.definition.contributes ?? [])
                {
                    places.fill(plugin.name, contribution);
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

                readGranted = () =>
                {
                    const answered = source.definition.grants?.(context(source.name)) ?? [];

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

            // "Nothing partially starts" is the promise; a setup that threw
            // used to leave every earlier plugin holding its sockets and timers
            const ready: Plugin[] = [];

            try
            {
                for (const plugin of order)
                {
                    await plugin.definition.setup?.(context(plugin.name));
                    ready.push(plugin);
                }
            }
            catch (cause)
            {
                for (const plugin of [...ready].reverse())
                {
                    try
                    {
                        await plugin.definition.teardown?.(context(plugin.name));
                    }
                    catch (failed)
                    {
                        log("error", plugin.name, "teardown threw while unwinding a failed start", { cause: failed instanceof Error ? failed.message : String(failed) });
                    }
                }

                clear();

                throw cause;
            }

            running = true;
            stopped = false;

            // A command naming no permission runs for anyone holding an
            // account. Routes get UNGRANTABLE_PERMISSION and a 403 page;
            // commands had neither, and an omission carries no signal.
            const ungated = order
                .flatMap((plugin) => Object.entries(plugin.definition.commands ?? {}).map(([command, declared]) => ({ plugin: plugin.name, command, declared })))
                .filter(({ declared }) => (declared.requires ?? []).length === 0)
                .map(({ plugin, command }) => `${plugin}: ${command}`);

            // sends reads ctx.services, so it cannot run before setup — but it
            // can run here, where a clash costs a boot rather than the first
            // request that happened to need a header.
            const wroteHeader = new Map<string, string>();

            for (const plugin of order)
            {
                for (const name of Object.keys(plugin.definition.sends?.(context(plugin.name)) ?? {}))
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

            if (ungated.length > 0)
            {
                log("warn", "kernel", "COMMANDS ANY VIEWER MAY RUN", {
                    meaning: "these name no permission, so every viewer may run them",
                    commands: ungated,
                    turnOn: "declare requires: [...] on each, or leave it if anyone really may",
                });
            }

            permits.changed();
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

            stopped = true;

            clear();
        },

        // the definitions themselves, so declarationsOf can read them without
        // the kernel having to know what a declaration looks like
        plugins: (): readonly Plugin[] =>
        {
            return [...order];
        },

        routes: (): readonly RegisteredRoute[] =>
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
            const notFound = order.find((plugin) => plugin.definition.pages?.missing !== undefined);

            return {
                ...(forbidden?.definition.pages?.forbidden !== undefined && {
                    forbidden: forbidden.definition.pages.forbidden,
                }),
                ...(notFound?.definition.pages?.missing !== undefined && {
                    missing: notFound.definition.pages.missing,
                }),
            };
        },

        slot: (name, payload) =>
        {
            const contents = places.contentsOf(name, payload);

            // Filtered here rather than only in <Slot>: a server-rendered page
            // or any non-React reader asked the kernel and was handed back
            // contributions the viewer may not see.
            return {
                ...contents,
                contributions: contents.contributions.filter((contribution) => permits.all(contribution.requires ?? [])),
            };
        },

        hasSlot: (name) =>
        {
            return places.known(name);
        },

        fallbackFor: (plugin) =>
        {
            return registry.get(plugin)?.definition.fallback;
        },

        context,

        permissions: permits,

        locale: locales.forPlugin(undefined),

        events: { failures: bus.failures },

        run,

        sent: () =>
        {
            // a stopped kernel kept handing back the session header, so a
            // request in flight during sign-out still carried the old token
            if (stopped)
            {
                return {};
            }

            const headers: Record<string, string> = {};
            const author = new Map<string, string>();

            for (const plugin of registry.values())
            {
                for (const [name, value] of Object.entries(plugin.definition.sends?.(context(plugin.name)) ?? {}))
                {
                    const wrote = author.get(name.toLowerCase());

                    if (wrote !== undefined)
                    {
                        throw new KernelFault(
                            "DUPLICATE_HEADER",
                            `"${plugin.name}" and "${wrote}" both send "${name}". One plugin owns a header, or which one answers depends on the order they booted.`,
                            { plugin: plugin.name },
                        );
                    }

                    author.set(name.toLowerCase(), plugin.name);
                    headers[name] = value;
                }
            }

            return headers;
        },
    };
}

function inDependencyOrder(registry: ReadonlyMap<string, Plugin>): Plugin[]
{
    const ordered: Plugin[] = [];
    const state = new Map<string, "open" | "done">();

    function walk(name: string): void
    {
        if (state.get(name) !== undefined)
        {
            return;
        }

        state.set(name, "open");

        const plugin = registry.get(name);

        for (const need of [...(plugin?.definition.dependsOn ?? [])].sort())
        {
            if (registry.has(need))
            {
                walk(need);
            }
        }

        state.set(name, "done");

        if (plugin !== undefined)
        {
            ordered.push(plugin);
        }
    }

    for (const name of [...registry.keys()].sort())
    {
        walk(name);
    }

    return ordered;
}
