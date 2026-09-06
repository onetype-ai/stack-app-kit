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

    /** The host, for a caller reaching a plugin's api from outside them. */
    get host(): Host
    {
        return this.#host;
    }

    /** The plugins in the order they booted. */
    get order(): string[]
    {
        return this.#order.map((plugin) => plugin.name);
    }

    /**
     * Runs each plugin's start, in boot order.
     *
     * A failure stops the ones already started, in reverse, so a half-started
     * kernel never keeps running.
     */
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

    /**
     * Unwinds in reverse, and keeps going past a failure: a plugin that
     * cannot stop must not strand the ones behind it holding a socket.
     */
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
        this.#host.reach("stopped");
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
    const known = new Map<string, Plugin>();

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

        if (known.has(plugin.name))
        {
            throw new Fault("REGISTERED_TWICE", `"${plugin.name}" was given twice.`, plugin.name);
        }

        known.set(plugin.name, plugin);
    }

    const sorted = order(known);
    const host = new Host(say);

    for (const plugin of sorted)
    {
        plugin.boot(host.as(plugin.name));
    }

    host.reach("running");

    return new RunningApp(host, sorted);
}
