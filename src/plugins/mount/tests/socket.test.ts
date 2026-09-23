import { describe, expect, test } from "vitest";

import { definePlugin } from "../../kernel/api";
import type { Context } from "../../kernel/api";
import type { Socket } from "../../transport/api";
import { start } from "../internal/start";

function openingSocket(opened: ((run: (kind: string, event: unknown) => void) => void) = () => {}): Socket
{
    const listeners = new Map<string, ((event: unknown) => void)[]>();

    opened((kind, event) =>
    {
        for (const run of listeners.get(kind) ?? [])
        {
            run(event);
        }
    });

    setTimeout(() =>
    {
        for (const run of listeners.get("open") ?? [])
        {
            run({});
        }
    }, 0);

    return {
        send: () => {},
        close: () => {},
        addEventListener: (kind, run) =>
        {
            listeners.set(kind, [...(listeners.get(kind) ?? []), run]);
        },
    };
}

describe("the socket an application opens", () =>
{
    test("is dialled only once every plugin started, so its address already carries what they send", async () =>
    {
        const addresses: string[] = [];
        let workspace: string | undefined;

        const desk = definePlugin("desk", {
            version: "1.0.0",
            describe: "Says which workspace the viewer is in.",
            sends: (): Record<string, string> => (workspace === undefined ? {} : { "x-workspace": workspace }),
            setup: () =>
            {
                workspace = "a";
            },
        });

        const app = await start({
            plugins: [desk],
            transport: {
                baseUrl: "/api",
                wsUrl: (sent) => `wss://example.test/ws?workspace=${sent["x-workspace"] ?? "none"}`,
                openSocket: (url) =>
                {
                    addresses.push(url);

                    return openingSocket();
                },
            },
        });

        expect(addresses).toEqual(["wss://example.test/ws?workspace=a"]);
        expect(app.channel).toBe("ws");

        await app.stop();
    });

    test("is dialled again when a plugin asks, reading the address as it is now", async () =>
    {
        const addresses: string[] = [];
        let workspace = "a";
        let held: Context | undefined;

        const desk = definePlugin("desk", {
            version: "1.0.0",
            describe: "Switches the workspace the viewer is in.",
            sends: () => ({ "x-workspace": workspace }),
            setup: (ctx) =>
            {
                held = ctx;
            },
        });

        const app = await start({
            plugins: [desk],
            transport: {
                baseUrl: "/api",
                wsUrl: (sent) => `wss://example.test/ws?workspace=${sent["x-workspace"] ?? "none"}`,
                openSocket: (url) =>
                {
                    addresses.push(url);

                    return openingSocket();
                },
            },
        });

        workspace = "b";
        held?.realtime.reconnect();

        expect(addresses).toEqual(["wss://example.test/ws?workspace=a", "wss://example.test/ws?workspace=b"]);

        await app.stop();
    });

    test("tells a listening plugin once it is back, so it fetches what it missed", async () =>
    {
        const fire: ((kind: string, event: unknown) => void)[] = [];
        const heard: unknown[] = [];

        const board = definePlugin("board", {
            version: "1.0.0",
            describe: "Fetches again what it shows once the socket is back.",
            dependsOn: ["transport"],
            listens: {
                "transport.reconnected": {
                    describe: "Fetches the items again.",
                    handle: (payload) =>
                    {
                        heard.push(payload);
                    },
                },
            },
        });

        const app = await start({
            plugins: [board],
            transport: {
                baseUrl: "/api",
                wsUrl: "wss://example.test/ws",
                connectTimeoutMs: 50,
                reconnectBaseMs: 10,
                openSocket: () => openingSocket((run) => fire.push(run)),
            },
        });

        fire[0]?.("close", { code: 1006 });
        await new Promise((resolve) => setTimeout(resolve, 150));

        expect(heard).toHaveLength(1);
        expect(heard[0]).toMatchObject({ downMs: expect.any(Number) });

        await app.stop();
    });
});

