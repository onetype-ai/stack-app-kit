import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { TransportOptions } from "../api";
import type { Answering } from "./fake";
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

function startDialling(settings: Partial<TransportOptions> = {}, answers?: Answering[])
{
    const app = dialling(settings, answers);

    opened.push(app);

    return app;
}

describe("a socket address that follows the viewer", () =>
{
    test("dials nothing while the address answers undefined, and dials once reconnect is asked", async () =>
    {
        const app = startDialling();

        app.choose(undefined);
        const channel = await app.transport.connect();

        app.choose("a");
        app.transport.reconnect();

        expect(channel).toBe("http");
        expect(app.dialled.map((socket) => socket.url)).toEqual(["wss://example.test/ws?workspace=a"]);
    });

    test("reconnect closes the old socket and says every subscription again on the new one", async () =>
    {
        const app = startDialling();
        const heard: unknown[] = [];
        const first = await app.connected();

        app.transport.subscribe("inbox.updated", (message) =>
        {
            heard.push(message);
        });
        app.choose("b");
        app.transport.reconnect();
        const second = app.last();
        second.opened();
        first.delivered(JSON.stringify({ channel: "inbox.updated", body: "from a" }));
        second.delivered(JSON.stringify({ channel: "inbox.updated", body: "from b" }));

        expect(second.url).toBe("wss://example.test/ws?workspace=b");
        expect(second.sent()).toEqual([JSON.stringify({ subscribe: "inbox.updated" })]);
        expect(heard).toEqual(["from b"]);
    });

    test("sign out closes every socket, one still dialling too, and the old viewer hears nothing more", async () =>
    {
        const app = startDialling();
        const heard: unknown[] = [];
        app.transport.subscribe("inbox.updated", (message) =>
        {
            heard.push(message);
        });
        app.transport.reconnect();
        const signingIn = app.transport.connect();
        app.last().opened();
        await signingIn;

        app.choose(undefined);
        app.transport.reconnect();
        for (const socket of app.dialled)
        {
            socket.delivered(JSON.stringify({ channel: "inbox.updated", body: "for a" }));
        }

        expect(app.dialled.length).toBeGreaterThan(0);
        expect(app.dialled.every((socket) => socket.isClosed())).toBe(true);
        expect(heard).toEqual([]);
        expect(await app.transport.connect()).toBe("http");
    });

    test("reads the address again on a redial after the server drops the socket", async () =>
    {
        const app = startDialling();
        const first = await app.connected();

        app.choose("b");
        first.dropped(1006);
        await vi.advanceTimersByTimeAsync(1_000);

        expect(app.dialled.map((socket) => socket.url)).toEqual([
            "wss://example.test/ws?workspace=a",
            "wss://example.test/ws?workspace=b",
        ]);
    });

    test("keeps redialling when working out the address throws once", async () =>
    {
        let failing = true;
        const app = startDialling({
            wsUrl: () =>
            {
                if (failing)
                {
                    failing = false;
                    throw new Error("The workspace store was not ready.");
                }

                return "wss://example.test/ws";
            },
        });

        await app.transport.connect();
        await vi.advanceTimersByTimeAsync(1_000);

        expect(app.dialled.map((socket) => socket.url)).toEqual(["wss://example.test/ws"]);
    });

    test("a fixed address still dials as before", async () =>
    {
        const app = startDialling({ wsUrl: "wss://example.test/fixed" });

        await app.connected();

        expect(app.transport.channel()).toBe("ws");
        expect(app.last().url).toBe("wss://example.test/fixed");
    });
});

describe("requests over the socket", () =>
{
    test("carry the same headers http would, so the server reads the same caller", async () =>
    {
        const app = startDialling();
        const socket = await app.connected();

        void app.transport.request({ method: "GET", path: "/items", headers: { "x-trace": "1" } });

        const frame = JSON.parse(socket.sent()[0] ?? "{}") as { headers?: Record<string, string> };

        expect(frame.headers).toEqual({ "x-workspace": "a", "x-trace": "1" });
    });

    test("a refusal carries the body, the method and the path, so a form can show what the server rejected", async () =>
    {
        const app = startDialling();
        const socket = await app.connected();

        const refused = app.transport.request({ method: "POST", path: "/items", body: {} }).catch((error: unknown) => error);
        const { id } = JSON.parse(socket.sent()[0] ?? "{}") as { id: string };
        socket.delivered(JSON.stringify({ id, status: 400, body: { fields: { name: "required" } } }));

        expect(await refused).toMatchObject({ code: "CLIENT", method: "POST", path: "/items", body: { fields: { name: "required" } } });
    });

    test("socketFor push sends every request over http, even while the socket is open", async () =>
    {
        const app = startDialling({ socketFor: "push" });
        const socket = await app.connected();

        await app.transport.request({ method: "GET", path: "/items" });

        expect(socket.sent()).toEqual([]);
        expect(app.fetches.calls()).toHaveLength(1);
        expect(app.transport.channel()).toBe("ws");
    });

    test("refuses a socketFor it does not know, naming the two it does", () =>
    {
        expect(() => startDialling({ socketFor: "sometimes" as "push" })).toThrow("\"requests\" or \"push\"");
    });
});

describe("redialling", () =>
{
    test.each([[4001, "signed out"], [4003, "forbidden"]])("waits for reconnect after the server closed the socket with %i (%s)", async (code) =>
    {
        const app = startDialling();
        const socket = await app.connected();

        socket.dropped(code);
        await vi.advanceTimersByTimeAsync(60_000);
        const whileRefused = app.dialled.length;
        app.transport.reconnect();

        expect(whileRefused).toBe(1);
        expect(app.dialled).toHaveLength(2);
    });

    test("redials at once when a socket that lived reached its lifetime", async () =>
    {
        const app = startDialling();
        const socket = await app.connected();

        await vi.advanceTimersByTimeAsync(900_000);
        socket.dropped(4000);
        await vi.advanceTimersByTimeAsync(0);

        expect(app.dialled).toHaveLength(2);
    });

    test("backs off from a server that ends every socket as soon as it opens, even as lifetime reached", async () =>
    {
        const app = startDialling();

        await app.connected();

        for (let round = 0; round < 20; round += 1)
        {
            app.last().opened();
            app.last().dropped(4000);
            await vi.advanceTimersByTimeAsync(0);
        }

        const atOnce = app.dialled.length;
        await vi.advanceTimersByTimeAsync(60_000);

        expect(atOnce).toBe(1);
        expect(app.dialled.length).toBeLessThan(10);
    });

    test("starts the backoff over once a socket lived, so a later drop waits the base again", async () =>
    {
        const app = startDialling({ connectTimeoutMs: 600_000 });

        void app.transport.connect();

        for (let failure = 0; failure < 3; failure += 1)
        {
            app.last().dropped(1006);
            await vi.advanceTimersByTimeAsync(30_000);
        }

        app.last().opened();
        await vi.advanceTimersByTimeAsync(10_000);
        const beforeTheDrop = app.dialled.length;
        app.last().dropped(1006);
        await vi.advanceTimersByTimeAsync(500);

        expect(app.dialled).toHaveLength(beforeTheDrop + 1);
    });

    test.each([
        [1, 999, "up to the whole backoff"],
        [0, 499, "at least half of it, so a tab never redials in a tight loop"],
    ])("spreads a redial (random %i): not before %i ms, %s", async (random, justBefore) =>
    {
        const app = startDialling({ random: () => random });
        const socket = await app.connected();

        socket.dropped(1006);
        await vi.advanceTimersByTimeAsync(justBefore);
        const before = app.dialled.length;
        await vi.advanceTimersByTimeAsync(1);

        expect(before).toBe(1);
        expect(app.dialled).toHaveLength(2);
    });

    test("closes a socket that opens only after the connect timeout, rather than letting it take over", async () =>
    {
        const app = startDialling();
        const connecting = app.transport.connect();
        const late = app.last();

        await vi.advanceTimersByTimeAsync(1_000);
        late.opened();

        expect(await connecting).toBe("http");
        expect(app.transport.channel()).toBe("http");
    });

    test("ignores a socket that opens after the connect timeout while its close is still under way", async () =>
    {
        const app = startDialling();
        const connecting = app.transport.connect();
        const late = app.last();
        let closeAsked = 0;
        late.close = () =>
        {
            closeAsked += 1;
        };

        await vi.advanceTimersByTimeAsync(1_000);
        late.opened();

        expect(await connecting).toBe("http");
        expect(closeAsked).toBe(2);
        expect(app.transport.channel()).toBe("http");
    });

    test("stops for good once closed, even with a redial waiting", async () =>
    {
        const app = startDialling();
        const socket = await app.connected();

        socket.dropped(1006);
        app.transport.close();
        await vi.advanceTimersByTimeAsync(60_000);
        app.transport.reconnect();

        expect(app.dialled).toHaveLength(1);
    });

    test("reconnect with no socket configured does nothing", async () =>
    {
        const app = startDialling({ wsUrl: undefined });

        app.transport.reconnect();

        expect(await app.transport.connect()).toBe("http");
        expect(app.dialled).toEqual([]);
    });
});

describe("retrying over http", () =>
{
    test("spreads each wait between half and all of its backoff", async () =>
    {
        const waits: number[] = [];
        const answers: Answering[] = [{ status: 503 }, { status: 503 }, { body: {} }];

        for (const random of [0, 1])
        {
            const app = startDialling({ wsUrl: undefined, random: () => random, retryBaseMs: 200, sleep: async (ms) => { waits.push(ms); } }, answers);

            await app.transport.request({ method: "GET", path: "/items" });
            await app.stop();
        }

        expect(waits).toEqual([100, 200, 200, 400]);
    });
});
