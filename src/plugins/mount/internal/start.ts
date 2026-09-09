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

    const beforeKernel: string[] = [];
    let announce = (path: string): void =>
    {
        beforeKernel.push(path);
    };

    let contributed = (): Readonly<Record<string, string>> => ({});

    const app = boot(say, [
        transportPlugin({
            ...starting.transport,
            headers: () => ({ ...starting.transport.headers?.(), ...contributed() }),
            onUnauthorized: (path: string) =>
            {
                starting.transport.onUnauthorized?.(path);
                announce(path);
            },
        }),
    ]);

    const carrier = transportFrom(app.host);

    if (carrier === undefined)
    {
        throw new Error("mount: the transport plugin offered nothing.");
    }

    const channel = await carrier.connect();

    log?.info("transport ready", { channel });

    const realtime: Realtime = {
        channel: () =>
        {
            return carrier.channel();
        },
        subscribe: (topic, receive) =>
        {
            return carrier.subscribe(topic, receive);
        },
    };

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
        http: client(carrier),
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

    contributed = () => kernel.sent();

    for (const path of beforeKernel.splice(0))
    {
        announce(path);
    }

    return {
        kernel,
        http: client(carrier),
        realtime,
        channel,

        stop: async (): Promise<void> =>
        {
            await kernel.stop();
            await app.stop();
        },
    };
}
