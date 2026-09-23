import { boot } from "../../../kernel/boot";
import { closeOver } from "../../../kernel/closure";
import type { HostLog } from "../../../kernel/host";
import { z } from "zod";

import { createKernel, definePlugin } from "../../kernel/api";
import type { Plugin as AppPlugin, Realtime } from "../../kernel/api";
import { from as transportFrom } from "../../transport/api";
import { transportPlugin } from "../../transport/plugin";
import { tree } from "../../router/api";
import type { StartOptions, StartedApp } from "../api";
import { client } from "./client";

/** Brings an application up: transport, then kernel, then plugins. */
export async function start(given: StartOptions): Promise<StartedApp>
{
    const closed = await closeOver(given.plugins, given.config);
    const starting: StartOptions = { ...given, plugins: closed.plugins as readonly AppPlugin[], ...(closed.config !== undefined && { config: closed.config }) };
    const logger = starting.log;
    const log: HostLog = (line, about) =>
    {
        logger?.info(line, about);
    };

    const beforeKernel: string[] = [];
    let announce = (path: string): void =>
    {
        beforeKernel.push(path);
    };

    let contributed = (): Readonly<Record<string, string>> => ({});

    const app = boot(log, [
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

    const realtime: Realtime = {
        channel: () =>
        {
            return carrier.channel();
        },
        subscribe: (topic, receive) =>
        {
            return carrier.subscribe(topic, receive);
        },
        reconnect: () =>
        {
            carrier.reconnect();
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
        ...(starting.grantedBy !== undefined && { grantedBy: starting.grantedBy }),
        ...(logger !== undefined && {
            log: (level, plugin, line, extra) =>
            {
                logger[level](`${plugin}: ${line}`, extra);
            },
        }),
    });

    // before start, so a request made inside a plugin's setup carries the
    // headers every later request carries; it went out unauthenticated
    contributed = () => kernel.sent();

    await kernel.start();

    announce = (path: string): void =>
    {
        kernel.context("transport").events.emit("transport.unauthorized", { path });
    };

    for (const path of beforeKernel.splice(0))
    {
        announce(path);
    }

    const channel = await carrier.connect();

    logger?.info("transport ready", { channel });

    const building = starting.router;

    return {
        kernel,
        http: client(carrier),
        realtime,
        channel,

        router: building === undefined
            ? undefined
            : tree(kernel, building.building, {
                shell: building.wrap(kernel.frame(), building.outlet),
                missing: building.missing,
                landing: building.landing,
            }, building.guard),

        stop: async (): Promise<void> =>
        {
            await kernel.stop();
            await app.stop();
        },
    };
}
