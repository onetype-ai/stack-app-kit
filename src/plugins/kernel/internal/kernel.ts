import { createLocale, localeProblems } from "./locale";
import type { LocaleOptions } from "./locale";
import type { Cache, HttpClient, Context, FallbackProps, Pages, Plugin, Realtime, Route } from "./contract";
import { events, type ListenerFailure } from "./events";
import { KernelFault } from "./faults";
import { hooks } from "./hooks";
import { permissions, type PermissionSource } from "./permissions";
import type { mirror} from "./mirror";
import { startMirrors } from "./mirror";
import { pipelines, type ExplainedStep } from "./pipelines";
import { registries, type RegistryEntry } from "./registries";
import { refuseSharedHeaders, warnUngated } from "./settling";
import { slots, type MountedContribution } from "./slots";
import { addAll, declareAll, explainAll } from "./declaring";
import { access } from "./access";
import { commandsTable } from "./commanding";
import { contexts } from "./context";
import { given } from "./given";
import { grantsFrom } from "./granting";
import { inDependencyOrder } from "./order";
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

    /** A pipeline's steps in the order they run, and who put each there. */
    explain: (pipeline: string) => readonly ExplainedStep[];

    /** A registry as the viewer sees it: `list` changes identity only when an entry or a permission changed. */
    registry: (name: string) => {
        list: () => readonly RegistryEntry[];
        watch: (notify: () => void) => () => void;
    };
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

/** Builds a kernel from what the application declared. */
export function createKernel(options: KernelOptions): Kernel
{
    const config = options.config ?? {};
    const log = options.log ?? quiet;
    const localeOptions: LocaleOptions = options.locale ?? { supported: ["en"], fallback: "en" };
    const locales = createLocale(localeOptions, (message) =>
    {
        throw new KernelFault("INVALID_CONFIG", `locale: ${message}`);
    });
    const { http, cache, realtime } = given(options);

    const registry = new Map(options.plugins.map((plugin) => [plugin.name, plugin]));
    const bus = events<Context>(Date.now, (failure) =>
    {
        log("error", failure.plugin, `listening to "${failure.event}" failed`, { cause: failure.error instanceof Error ? failure.error.message : String(failure.error) });
    });
    const points = hooks<Context>();
    const lists = registries((plugin, line, about) =>
    {
        log("warn", plugin, line, about);
    });
    const places = slots(lists);
    const flows = pipelines();
    const mirrors = new Map<string, ReturnType<typeof mirror>>();
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
    let running = false;
    let stopped = false;
    const commands = commandsTable(permits, () => running);

    // start() fills these; leaving them means a restart registers twice and a
    // listener keeps firing against state its teardown released.
    const clear = (): void =>
    {
        bus.reset();
        points.reset();
        places.reset();
        lists.reset();
        flows.reset();

        for (const one of mirrors.values())
        {
            one.stop();
        }

        mirrors.clear();
        services.clear();
        commands.clear();
        parsed.clear();
        order = [];
        readGranted = undefined;
        running = false;
    };
    let order: Plugin[] = [];

    const parsed = new Map<string, unknown>();

    const reach = access(lists, permits, registry);
    const context = contexts({
        config,
        parsed,
        services,
        byName: registry,
        log,
        http,
        cache,
        realtime,
        clearGivenCache: () =>
        {
            options.cache?.clear?.();
        },
        bus,
        points,
        permits,
        locales,
        flows,
        mirrors,
        reach,
        isRunning: () => running,
        run: (command, input) => commands.run(command, input, context),
    });

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

            declareAll(order, { bus, points, places, lists, flows });

            const refused = addAll(order, { lists, flows });

            if (refused.length > 0)
            {
                clear();

                throw new KernelFault("INVALID_ENTRY", `${refused.length} ${refused.length === 1 ? "entry" : "entries"} stopped the kernel from starting:\n${refused.join("\n")}`);
            }

            explainAll(order, flows, log);

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
                    commands.declare(plugin.name, key, command);
                }
            }

            readGranted = grantsFrom(order, options, context, log);

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

            refuseSharedHeaders(order, context);
            warnUngated(order, log);
            startMirrors(lists, bus, http, realtime, log, mirrors);

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

        explain: (name) =>
        {
            return flows.explain(name);
        },

        registry: (name) =>
        {
            return {
                list: () => reach.visible(name),
                watch: (notify) =>
                {
                    const stopEntries = lists.watch(name, notify);
                    const stopPermits = permits.watch(notify);

                    return () =>
                    {
                        stopEntries();
                        stopPermits();
                    };
                },
            };
        },

        fallbackFor: (plugin) =>
        {
            return registry.get(plugin)?.definition.fallback;
        },

        context,

        permissions: permits,

        locale: locales.forPlugin(undefined),

        events: { failures: bus.failures },

        run: (command, input) => commands.run(command, input, context),

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
