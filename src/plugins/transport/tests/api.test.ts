import { afterEach, describe, expect, test } from "vitest";

import { boot } from "../../../kernel/boot";
import { TransportFault, from } from "../api";
import type { Transport } from "../api";
import { plugin } from "../plugin";
import { fakeFetch, fakeSocket, type Answering } from "./fake";

const quiet = (): void => {};

let restore: (() => void) | undefined;

afterEach(() =>
{
    restore?.();
    restore = undefined;
});

/** A booted transport, and the fetch behind it. */
function startTransport(answers: Answering[], settings: Partial<Parameters<typeof plugin>[0]> = {})
{
    const fetches = fakeFetch(answers);

    restore = fetches.restore;

    const app = boot(quiet, [plugin({ baseUrl: "https://example.test/api", ...settings })]);
    const transport = from(app.host);

    if (transport === undefined)
    {
        throw new Error("transport was not offered");
    }

    return { transport, fetches, app };
}

describe("requests", () =>
{
    test("returns the parsed body", async () =>
    {
        const { transport } = startTransport([{ body: { id: 1 } }]);

        const body = await transport.request({ method: "GET", path: "/items" });

        expect(body).toEqual({ id: 1 });
    });

    test("builds the url from base, path and query", async () =>
    {
        const { transport, fetches } = startTransport([{ body: {} }]);

        await transport.request({ method: "GET", path: "/items", query: { page: 2, q: "a b" } });

        expect(fetches.calls()[0]?.url).toBe("https://example.test/api/items?page=2&q=a+b");
    });

    test("a 204 answers undefined rather than failing on an empty body", async () =>
    {
        const { transport } = startTransport([{ status: 204 }]);

        await expect(transport.request({ method: "DELETE", path: "/items/1" })).resolves.toBeUndefined();
    });

    test("a body that is not json is MALFORMED", async () =>
    {
        const { transport } = startTransport([{ json: false }]);

        const failed = await transport.request({ method: "GET", path: "/items" }).catch((cause: unknown) => cause);

        expect(failed).toBeInstanceOf(TransportFault);
        expect((failed as TransportFault).code).toBe("MALFORMED");
    });
});

describe("refusals", () =>
{
    test.each([
        [400, "CLIENT"],
        [401, "UNAUTHORIZED"],
        [403, "FORBIDDEN"],
        [404, "NOT_FOUND"],
        [409, "CONFLICT"],
        [429, "RATE_LIMITED"],
        [500, "SERVER"],
    ])("status %i is %s", async (status, code) =>
    {
        const { transport } = startTransport([{ status, body: {} }], { retries: 0 });

        const failed = await transport.request({ method: "GET", path: "/items" }).catch((cause: unknown) => cause);

        expect((failed as TransportFault).code).toBe(code);
    });

    test("carries the method and the path, and never an internal path", async () =>
    {
        const { transport } = startTransport([{ status: 404, body: {} }]);

        const failed = (await transport
            .request({ method: "GET", path: "/items" })
            .catch((cause: unknown) => cause)) as TransportFault;

        expect(failed.method).toBe("GET");
        expect(failed.path).toBe("/items");
        expect(failed.message).not.toMatch(/src\/|internal\//);
    });

    test("carries the body, so a form can show what the server rejected", async () =>
    {
        const { transport } = startTransport([{ status: 400, body: { fields: { email: "taken" } } }]);

        const failed = (await transport
            .request({ method: "POST", path: "/users" })
            .catch((cause: unknown) => cause)) as TransportFault;

        expect(failed.body).toEqual({ fields: { email: "taken" } });
    });

    test("a 401 tells the caller once, and does not retry", async () =>
    {
        const seen: string[] = [];
        const { transport, fetches } = startTransport([{ status: 401, body: {} }], {
            onUnauthorized: (path: string) => seen.push(path),
        });

        await transport.request({ method: "GET", path: "/me" }).catch(() => undefined);

        expect(seen).toEqual(["/me"]);
        expect(fetches.calls()).toHaveLength(1);
    });
});

describe("retrying", () =>
{
    test("retries an idempotent request until it succeeds", async () =>
    {
        const { transport, fetches } = startTransport([{ status: 500, body: {} }, { status: 500, body: {} }, { body: { ok: true } }], {
            sleep: async () => {},
        });

        await expect(transport.request({ method: "GET", path: "/items" })).resolves.toEqual({ ok: true });

        expect(fetches.calls()).toHaveLength(3);
    });

    test("never retries a POST, so it cannot apply twice", async () =>
    {
        const { transport, fetches } = startTransport([{ status: 500, body: {} }], { sleep: async () => {} });

        await transport.request({ method: "POST", path: "/items", body: { a: 1 } }).catch(() => undefined);

        expect(fetches.calls()).toHaveLength(1);
    });

    test("stops at the configured number of attempts", async () =>
    {
        const { transport, fetches } = startTransport([{ status: 500, body: {} }], { retries: 1, sleep: async () => {} });

        await transport.request({ method: "GET", path: "/items" }).catch(() => undefined);

        expect(fetches.calls()).toHaveLength(2);
    });

    test("does not retry a refusal that trying again cannot fix", async () =>
    {
        const { transport, fetches } = startTransport([{ status: 404, body: {} }], { sleep: async () => {} });

        await transport.request({ method: "GET", path: "/items" }).catch(() => undefined);

        expect(fetches.calls()).toHaveLength(1);
    });
});

describe("without a socket", () =>
{
    test("connect stays on http", async () =>
    {
        const { transport } = startTransport([{ body: {} }]);

        await expect(transport.connect()).resolves.toBe("http");
        expect(transport.channel()).toBe("http");
    });

    test("subscribe succeeds and delivers nothing, so a caller needs no branch", async () =>
    {
        const { transport } = startTransport([{ body: {} }]);
        const heard: unknown[] = [];

        const subscription = transport.subscribe("items", (message) => heard.push(message));

        expect(() => subscription.close()).not.toThrow();
        expect(heard).toEqual([]);
    });
});

describe("with a socket", () =>
{
    /** A transport whose socket the test drives. */
    function startSocket(answers: Answering[] = [{ body: {} }])
    {
        const fetches = fakeFetch(answers);

        restore = fetches.restore;

        const sockets: ReturnType<typeof fakeSocket>[] = [];
        const app = boot(quiet, [
            plugin({
                baseUrl: "https://example.test/api",
                wsUrl: "wss://example.test/ws",
                openSocket: () =>
                {
                    const socket = fakeSocket();

                    sockets.push(socket);

                    return socket;
                },
                sleep: async () => {},
            }),
        ]);

        const transport = from(app.host) as Transport;

        return { transport, fetches, sockets };
    }

    test("connect opens one socket and answers ws", async () =>
    {
        const { transport, sockets } = startSocket();

        const connecting = transport.connect();

        sockets[0]?.opened();

        await expect(connecting).resolves.toBe("ws");
        expect(transport.channel()).toBe("ws");
    });

    test("connect twice opens one socket, not two", async () =>
    {
        const { transport, sockets } = startSocket();

        const first = transport.connect();
        const second = transport.connect();

        sockets[0]?.opened();

        await Promise.all([first, second]);
        await transport.connect();

        expect(sockets).toHaveLength(1);
    });

    test("a push reaches every subscriber on its channel", async () =>
    {
        const { transport, sockets } = startSocket();
        const heard: unknown[] = [];

        const connecting = transport.connect();

        sockets[0]?.opened();
        await connecting;

        transport.subscribe("items", (message) => heard.push(message));
        sockets[0]?.delivered(JSON.stringify({ channel: "items", body: { id: 7 } }));

        expect(heard).toEqual([{ id: 7 }]);
    });

    test("a closed subscription stops hearing", async () =>
    {
        const { transport, sockets } = startSocket();
        const heard: unknown[] = [];

        const connecting = transport.connect();

        sockets[0]?.opened();
        await connecting;

        transport.subscribe("items", (message) => heard.push(message)).close();
        sockets[0]?.delivered(JSON.stringify({ channel: "items", body: { id: 7 } }));

        expect(heard).toEqual([]);
    });

    test("a frame it cannot read is dropped rather than delivered", async () =>
    {
        const { transport, sockets } = startSocket();
        const heard: unknown[] = [];

        const connecting = transport.connect();

        sockets[0]?.opened();
        await connecting;

        transport.subscribe("items", (message) => heard.push(message));
        sockets[0]?.delivered("not json at all");
        sockets[0]?.delivered(JSON.stringify({ nothing: true }));

        expect(heard).toEqual([]);
    });

    test("a dropped socket fails what was in flight rather than hanging", async () =>
    {
        const { transport, sockets } = startSocket();

        const connecting = transport.connect();

        sockets[0]?.opened();
        await connecting;

        const request = transport.request({ method: "POST", path: "/items", body: { a: 1 } });

        sockets[0]?.dropped();

        const failed = (await request.catch((cause: unknown) => cause)) as TransportFault;

        expect(failed.code).toBe("NETWORK");
    });

    test("a dropped socket does not re-send a POST over http", async () =>
    {
        const { transport, sockets, fetches } = startSocket();

        const connecting = transport.connect();

        sockets[0]?.opened();
        await connecting;

        const request = transport.request({ method: "POST", path: "/items", body: { a: 1 } });

        sockets[0]?.dropped();
        await request.catch(() => undefined);

        expect(fetches.calls()).toHaveLength(0);
    });

    test("requests move to http once the socket is gone", async () =>
    {
        const { transport, sockets, fetches } = startSocket([{ body: { ok: true } }]);

        const connecting = transport.connect();

        sockets[0]?.opened();
        await connecting;

        sockets[0]?.dropped();

        await expect(transport.request({ method: "GET", path: "/items" })).resolves.toEqual({ ok: true });

        expect(transport.channel()).toBe("http");
        expect(fetches.calls()).toHaveLength(1);
    });

    test("close stops it for good", async () =>
    {
        const { transport, sockets } = startSocket();

        const connecting = transport.connect();

        sockets[0]?.opened();
        await connecting;

        transport.close();

        expect(transport.channel()).toBe("http");
    });
});
