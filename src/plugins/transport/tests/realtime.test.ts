import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { TransportOptions } from "../api";
import { dialling } from "./dialling";

const opened: { stop: () => Promise<void> }[] = [];

beforeEach(() =>
{
    vi.useFakeTimers();
});

afterEach(async () =>
{
    for (const app of opened.splice(0))
    {
        await app.stop();
    }

    vi.useRealTimers();
});

function startDialling(settings: Partial<TransportOptions> = {})
{
    const app = dialling(settings);

    opened.push(app);

    return app;
}

function said(value: unknown): string
{
    return JSON.stringify(value);
}

describe("a server that refuses the socket", () =>
{
    test("that asks for a backoff is left alone at least that long", async () =>
    {
        const app = startDialling();
        const socket = await app.connected();

        socket.delivered(said({ channel: "$backoff", ms: 20_000 }));
        socket.dropped(1013);
        await vi.advanceTimersByTimeAsync(19_999);
        const beforeItAsked = app.dialled.length;
        await vi.advanceTimersByTimeAsync(1);

        expect(beforeItAsked).toBe(1);
        expect(app.dialled).toHaveLength(2);
    });

    test("cannot ask for a backoff longer than five minutes", async () =>
    {
        const app = startDialling();
        const socket = await app.connected();

        socket.delivered(said({ channel: "$backoff", ms: 86_400_000 }));
        socket.dropped(1013);
        await vi.advanceTimersByTimeAsync(300_000);

        expect(app.dialled).toHaveLength(2);
    });
});

describe("a socket gone silent", () =>
{
    test("is closed and dialled again once a server that pings stops, since a half-open socket looks open", async () =>
    {
        const app = startDialling({ silenceMs: 60_000 });
        const socket = await app.connected();

        socket.delivered(said({ channel: "$ping" }));
        await vi.advanceTimersByTimeAsync(59_999);
        const beforeTheSilence = app.transport.channel();
        await vi.advanceTimersByTimeAsync(1);

        expect(beforeTheSilence).toBe("ws");
        expect(app.transport.channel()).toBe("http");
        await vi.advanceTimersByTimeAsync(1_000);
        expect(app.dialled).toHaveLength(2);
    });

    test("stays open while any frame keeps arriving", async () =>
    {
        const app = startDialling({ silenceMs: 60_000 });
        const socket = await app.connected();

        socket.delivered(said({ channel: "$ping" }));

        for (let minute = 0; minute < 5; minute += 1)
        {
            await vi.advanceTimersByTimeAsync(50_000);
            socket.delivered(said({ channel: "items", body: minute }));
        }

        expect(app.transport.channel()).toBe("ws");
    });

    test("is never timed when the server never pings, so an older server keeps its idle sockets", async () =>
    {
        const app = startDialling({ silenceMs: 60_000 });
        const socket = await app.connected();

        socket.delivered(said({ channel: "items", body: "once" }));
        await vi.advanceTimersByTimeAsync(600_000);

        expect(app.transport.channel()).toBe("ws");
        expect(app.dialled).toHaveLength(1);
    });
});

describe("a device waking up", () =>
{
    function waking()
    {
        let listener: (() => void) | undefined;

        return {
            wake: (listen: () => void) =>
            {
                listener = listen;

                return () =>
                {
                    listener = undefined;
                };
            },
            woke: () => listener?.(),
            isListening: () => listener !== undefined,
        };
    }

    test("redials at once rather than waiting out its backoff", async () =>
    {
        const device = waking();
        const app = startDialling({ wake: device.wake, random: () => 1 });
        await app.connected();

        for (let failure = 0; failure < 5; failure += 1)
        {
            app.last().dropped(1006);
            await vi.advanceTimersByTimeAsync(30_000);
        }

        const beforeWaking = app.dialled.length;
        app.last().dropped(1006);
        device.woke();
        await vi.advanceTimersByTimeAsync(1_000);

        expect(app.dialled).toHaveLength(beforeWaking + 1);
    });

    test("leaves a socket the server signed out alone", async () =>
    {
        const device = waking();
        const app = startDialling({ wake: device.wake });
        const socket = await app.connected();

        socket.dropped(4001);
        device.woke();
        await vi.advanceTimersByTimeAsync(60_000);

        expect(app.dialled).toHaveLength(1);
    });

    test("stops listening once the transport is closed", async () =>
    {
        const device = waking();
        const app = startDialling({ wake: device.wake });

        await app.connected();
        app.transport.close();

        expect(device.isListening()).toBe(false);
    });
});

describe("a channel the server declines", () =>
{
    test("tells the subscriber with the code, and keeps delivering nothing", async () =>
    {
        const app = startDialling();
        const socket = await app.connected();
        const codes: string[] = [];
        const heard: unknown[] = [];

        app.transport.subscribe("items", (message) => heard.push(message), (code) => codes.push(code));
        socket.delivered(said({ channel: "items", error: { code: "CHANNEL_REFUSED" } }));

        expect(codes).toEqual(["CHANNEL_REFUSED"]);
        expect(heard).toEqual([]);
    });

    test("stops telling a subscriber that left", async () =>
    {
        const app = startDialling();
        const socket = await app.connected();
        const codes: string[] = [];

        const leaving = app.transport.subscribe("items", () => {}, (code) => codes.push(`left: ${code}`));
        app.transport.subscribe("items", () => {}, (code) => codes.push(`stayed: ${code}`));
        leaving.close();
        socket.delivered(said({ channel: "items", error: { code: "CHANNEL_REFUSED" } }));

        expect(codes).toEqual(["stayed: CHANNEL_REFUSED"]);
    });
});

describe("coming back", () =>
{
    test("is announced once the server is ready and has answered every channel, with how long it was down", async () =>
    {
        const announced: number[] = [];
        const app = startDialling({ onReconnected: ({ downMs }) => announced.push(downMs) });
        app.transport.subscribe("items", () => {});
        app.transport.subscribe("tags", () => {});
        const first = await app.connected();

        first.dropped(1006);
        await vi.advanceTimersByTimeAsync(500);
        const second = app.last();
        second.opened();
        second.delivered(said({ channel: "$ready", connection: "c-2" }));
        second.delivered(said({ channel: "items", subscribed: true }));
        const beforeTheLastAnswer = announced.length;
        second.delivered(said({ channel: "tags", error: { code: "CHANNEL_REFUSED" } }));

        expect(beforeTheLastAnswer).toBe(0);
        expect(announced).toEqual([500]);
    });

    test("is announced after the connect timeout by a server that never says ready", async () =>
    {
        const announced: number[] = [];
        const app = startDialling({ onReconnected: ({ downMs }) => announced.push(downMs) });
        const first = await app.connected();

        first.dropped(1006);
        await vi.advanceTimersByTimeAsync(500);
        app.last().opened();
        await vi.advanceTimersByTimeAsync(999);
        const beforeTheTimeout = announced.length;
        await vi.advanceTimersByTimeAsync(1);

        expect(beforeTheTimeout).toBe(0);
        expect(announced).toHaveLength(1);
    });

    test("is never announced for the first socket, which nothing missed", async () =>
    {
        const announced: number[] = [];
        const app = startDialling({ onReconnected: ({ downMs }) => announced.push(downMs) });
        const socket = await app.connected();

        socket.delivered(said({ channel: "$ready", connection: "c-1" }));
        await vi.advanceTimersByTimeAsync(5_000);

        expect(announced).toEqual([]);
    });

    test("is announced once per socket, however many times the server says ready", async () =>
    {
        const announced: number[] = [];
        const app = startDialling({ onReconnected: ({ downMs }) => announced.push(downMs) });
        await app.connected();

        app.transport.reconnect();
        app.last().opened();
        app.last().delivered(said({ channel: "$ready" }));
        app.last().delivered(said({ channel: "$ready" }));
        await vi.advanceTimersByTimeAsync(5_000);

        expect(announced).toHaveLength(1);
    });
});
