import type { Cache, Context, HttpClient, Plugin, Realtime } from "./contract";
import type { events } from "./events";
import { KernelFault } from "./faults";
import type { hooks } from "./hooks";
import type { LogFn } from "./kernel";
import type { createLocale } from "./locale";
import type { mirror } from "./mirror";
import type { permissions } from "./permissions";
import type { pipelines } from "./pipelines";
import type { access } from "./access";

type Reaching = {
    config: Readonly<Record<string, unknown>>;
    parsed: ReadonlyMap<string, unknown>;
    services: ReadonlyMap<string, unknown>;
    byName: ReadonlyMap<string, Plugin>;
    log: LogFn;
    http: HttpClient;
    cache: Cache;
    realtime: Realtime;
    clearGivenCache: () => void;
    bus: ReturnType<typeof events<Context>>;
    points: ReturnType<typeof hooks<Context>>;
    permits: ReturnType<typeof permissions>;
    locales: ReturnType<typeof createLocale>;
    flows: ReturnType<typeof pipelines>;
    mirrors: ReadonlyMap<string, ReturnType<typeof mirror>>;
    reach: ReturnType<typeof access>;
    isRunning: () => boolean;
    run: (command: string, input: unknown) => Promise<void>;
};

// What every plugin function receives: the kernel seen from one plugin, which may reach only what it declared.
export function contexts({ config, parsed, services, byName, log, http, cache, realtime, clearGivenCache, bus, points, permits, locales, flows, mirrors, reach, isRunning, run }: Reaching): (plugin: string) => Context
{
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
                    if (!isRunning())
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
                    }, (owner) => owner === plugin || (byName.get(plugin)?.definition.dependsOn ?? []).includes(owner));
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

            locale: locales.forPlugin(byName.get(plugin)?.definition.messages),

            session: {
                changed: () =>
                {
                    clearGivenCache();

                    // gone before the next identity reads, as the socket is; refetched with the headers as they read now
                    for (const one of mirrors.values())
                    {
                        one.drop();
                    }

                    permits.changed();
                    realtime.reconnect();

                    for (const one of mirrors.values())
                    {
                        void one.refetch();
                    }
                },
            },

            registry: (name) =>
            {
                return reach.registryFor(plugin, name);
            },

            pipeline: (name) =>
            {
                reach.reachable(plugin, flows.ownerOf(name), "pipeline", name);

                return {
                    run: (input) => flows.run(name, input, context, (step, ms, outcome) =>
                    {
                        log("debug", plugin, `pipeline "${name}" step "${step}" ${outcome}`, { ms });
                    }),
                };
            },

            use: <Api,>(name: string): Api =>
            {
                const declared = byName.get(plugin)?.definition.dependsOn ?? [];

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

    return context;
}
