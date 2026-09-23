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
import { readyToHydrate } from "./hydration";
import { configFor } from "../../settings/api";

/** Brings an application up: transport, then kernel, then plugins. */
export async function start(given: StartOptions): Promise<StartedApp>
{
    const closed = await closeOver(given.plugins, given.config);
    const plugins = closed.plugins as readonly AppPlugin[];
    const fromEnvironment = given.environment === undefined ? {} : configFor(plugins, given.environment);
    const config = closed.config === undefined && given.environment === undefined ? undefined : { ...fromEnvironment, ...closed.config };
    const starting: StartOptions = { ...given, plugins, ...(config !== undefined && { config }) };
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
    let announceReconnected: (about: { downMs: number }) => void = () => {};

    const app = boot(log, [
        transportPlugin({
            ...starting.transport,
            headers: () => ({ ...starting.transport.headers?.(), ...contributed() }),
            onUnauthorized: (path: string) =>
            {
                starting.transport.onUnauthorized?.(path);
                announce(path);
            },
            onReconnected: (about: { downMs: number }) =>
            {
                starting.transport.onReconnected?.(about);
                announceReconnected(about);
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
        subscribe: (topic, receive, refused) =>
        {
            return carrier.subscribe(topic, receive, refused);
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
            "transport.reconnected": {
                describe: "The socket is back and every channel answered; pushes sent while it was down were lost, so fetch again what a view shows.",
                schema: z.object({ downMs: z.number() }),
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

    announceReconnected = (about) =>
    {
        kernel.context("transport").events.emit("transport.reconnected", about);
    };

    const channel = await carrier.connect();

    logger?.info("transport ready", { channel });

    const building = starting.router;
    const router = building === undefined
        ? undefined
        : tree(kernel, building.building, {
            shell: building.wrap(kernel.frame(), building.outlet),
            missing: building.missing,
            landing: building.landing,
        }, building.guard);

    if (starting.prerendered === true)
    {
        await readyToHydrate(router);
    }

    return {
        kernel,
        http: client(carrier),
        realtime,
        channel,
        router,

        stop: async (): Promise<void> =>
        {
            await kernel.stop();
            await app.stop();
        },
    };
}
