import { boot } from "../../../kernel/boot";
import type { WriteLine } from "../../../kernel/host";
import { z } from "zod";

import { createKernel, definePlugin } from "../../kernel/api";
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
    const say: WriteLine = (line, about) =>
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

    const channel = await live.connect();

    log?.info("transport ready", { channel });

    const realtime: Realtime = {
        channel: () =>
        {
            return live.channel();
        },
        subscribe: (channel, told) =>
        {
            return live.subscribe(channel, told);
        },
    };

    /**
     * What the mount announces on its own behalf.
     *
     * A 401 is heard by whoever wants to send the viewer somewhere, so it is
     * an event. Declared here because the kernel emits it, and an event no
     * plugin owns throws where it is emitted.
     */
    const announcer = definePlugin("transport", {
        version: "1.0.0",
        describe: "What the transport announces to the application.",
        emits: {
            "transport.unauthorized": {
                describe: "A request was refused for want of a session.",
                schema: z.object({ path: z.string() }),
            },
        },
    });

    const kernel = createKernel({
        plugins: [announcer, ...starting.plugins],
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
        channel,

        stop: async (): Promise<void> =>
        {
            await kernel.stop();
            await booted.stop();
        },
    };
}
