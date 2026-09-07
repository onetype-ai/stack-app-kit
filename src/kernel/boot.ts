import { Fault } from "./errors";
import { Host, type WriteLine } from "./host";
import { order } from "./order";
import type { Plugin } from "./plugin";

/** One run of the kernel: the plugins it booted, and the host they share. */
export class RunningApp
{
    readonly #host: Host;

    readonly #order: readonly Plugin[];

    #started: Plugin[] = [];

    constructor(host: Host, plugins: readonly Plugin[])
    {
        this.#host = host;
        this.#order = plugins;
    }

    get host(): Host
    {
        return this.#host;
    }

    get order(): string[]
    {
        return this.#order.map((plugin) => plugin.name);
    }

    async start(): Promise<void>
    {
        for (const plugin of this.#order)
        {
            try
            {
                await plugin.start?.(this.#host.as(plugin.name));
            }
            catch (cause)
            {
                await this.stop();

                throw cause;
            }

            this.#started.push(plugin);
        }
    }

    async stop(): Promise<void>
    {
        for (const plugin of [...this.#started].reverse())
        {
            try
            {
                await plugin.stop?.(this.#host.as(plugin.name));
            }
            catch (cause)
            {
                this.#host.say(`stop "${plugin.name}" threw`, { cause });
            }
        }

        this.#started = [];
        this.#host.enter("stopped");
    }
}

/**
 * Orders the plugins given and boots each one.
 *
 * Wiring only. A plugin that fails here stops everything, named, before
 * anything has run.
 */
export function boot(say: WriteLine, plugins: readonly Plugin[]): RunningApp
{
    const registry = new Map<string, Plugin>();

    for (const plugin of plugins)
    {
        if (plugin.name === "")
        {
            throw new Fault("NO_NAME", "a plugin was given without a name.");
        }

        if (typeof plugin.boot !== "function")
        {
            throw new Fault("NO_BOOT", `"${plugin.name}" has no boot.`, plugin.name);
        }

        if (registry.has(plugin.name))
        {
            throw new Fault("REGISTERED_TWICE", `"${plugin.name}" was given twice.`, plugin.name);
        }

        registry.set(plugin.name, plugin);
    }

    const ordered = order(registry);
    const host = new Host(say);

    for (const plugin of ordered)
    {
        plugin.boot(host.as(plugin.name));
    }

    host.enter("running");

    return new RunningApp(host, ordered);
}
