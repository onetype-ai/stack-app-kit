import { boot } from "../../../kernel/boot";
import type { Say } from "../../../kernel/host";
import { createKernel } from "../../kernel/api";
import type { Realtime } from "../../kernel/api";
import { from as transportFrom } from "../../transport/api";
import { plugin as transportPlugin } from "../../transport/plugin";
import type { Starting, Started } from "../api";
import { client } from "./client";

/**
 * Brings an application up: transport, then kernel, then plugins.
 *
 * The order matters. The transport connects before the kernel starts, so a
 * plugin's `setup` can make a request; and the kernel starts last, so a
 * refused contract stops everything before a plugin has run.
 */
export async function start(starting: Starting): Promise<Started>
{
    const log = starting.log;
    const say: Say = (line, about) =>
    {
        log?.info(line, about);
    };

    // A rejection can arrive before the kernel exists, and the plugin that
    // wants to hear it has not been built yet. Hold those and replay once it
    // can: dropping them would sign a user out with nothing on screen.
    const early: string[] = [];
    let announce = (path: string): void =>
    {
        early.push(path);
    };

    const booted = boot(say, [
        transportPlugin({
            ...starting.transport,
            onUnauthorized: (path: string) =>
            {
                starting.transport.onUnauthorized?.(path);
                announce(path);
            },
        }),
    ]);

    const live = transportFrom(booted.host);

    if (live === undefined)
    {
        throw new Error("mount: the transport plugin offered nothing.");
    }

    const carrying = await live.connect();

    log?.info("transport ready", { carrying });

    const realtime: Realtime = {
        channel: () =>
        {
            return live.carrying();
        },
        subscribe: (channel, told) =>
        {
            return live.subscribe(channel, told);
        },
    };

    const kernel = createKernel({
        plugins: starting.plugins,
        http: client(live),
        realtime,
        ...(starting.cache !== undefined && { cache: starting.cache }),
        ...(starting.config !== undefined && { config: starting.config }),
        ...(starting.permissions !== undefined && { permissions: starting.permissions }),
        ...(log !== undefined && {
            log: (level, plugin, line, extra) =>
            {
                log[level](`${plugin}: ${line}`, extra);
            },
        }),
    });

    await kernel.start();

    announce = (path: string): void =>
    {
        kernel.context("transport").events.emit("transport.unauthorized", { path });
    };

    for (const path of early.splice(0))
    {
        announce(path);
    }

    return {
        kernel,
        http: client(live),
        realtime,
        carrying,

        stop: async (): Promise<void> =>
        {
            await kernel.stop();
            await booted.stop();
        },
    };
}
