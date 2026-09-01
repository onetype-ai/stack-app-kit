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
function built(answers: Answering[], settings: Partial<Parameters<typeof plugin>[0]> = {})
{
    const fetching = fakeFetch(answers);

    restore = fetching.restore;

    const booted = boot(quiet, [plugin({ baseUrl: "https://example.test/api", ...settings })]);
    const held = from(booted.host);

    if (held === undefined)
    {
        throw new Error("transport was not offered");
    }

    return { held, fetching, booted };
}

describe("requests", () =>
{
    test("returns the parsed body", async () =>
    {
        const { held } = built([{ body: { id: 1 } }]);

        const body = await held.request({ method: "GET", path: "/items" });

        expect(body).toEqual({ id: 1 });
    });

    test("builds the url from base, path and query", async () =>
    {
        const { held, fetching } = built([{ body: {} }]);

        await held.request({ method: "GET", path: "/items", query: { page: 2, q: "a b" } });

        expect(fetching.calls()[0]?.url).toBe("https://example.test/api/items?page=2&q=a+b");
    });

    test("a 204 answers undefined rather than failing on an empty body", async () =>
    {
        const { held } = built([{ status: 204 }]);

        await expect(held.request({ method: "DELETE", path: "/items/1" })).resolves.toBeUndefined();
    });

    test("a body that is not json is MALFORMED", async () =>
    {
        const { held } = built([{ json: false }]);

        const failed = await held.request({ method: "GET", path: "/items" }).catch((cause: unknown) => cause);

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
        const { held } = built([{ status, body: {} }], { retries: 0 });

        const failed = await held.request({ method: "GET", path: "/items" }).catch((cause: unknown) => cause);

        expect((failed as TransportFault).code).toBe(code);
    });

    test("carries the method and the path, and never an internal path", async () =>
    {
        const { held } = built([{ status: 404, body: {} }]);

        const failed = (await held
            .request({ method: "GET", path: "/items" })
            .catch((cause: unknown) => cause)) as TransportFault;

        expect(failed.method).toBe("GET");
        expect(failed.path).toBe("/items");
        expect(failed.message).not.toMatch(/src\/|internal\//);
    });

    test("carries the body, so a form can show what the server rejected", async () =>
    {
        const { held } = built([{ status: 400, body: { fields: { email: "taken" } } }]);

        const failed = (await held
            .request({ method: "POST", path: "/users" })
            .catch((cause: unknown) => cause)) as TransportFault;

        expect(failed.body).toEqual({ fields: { email: "taken" } });
    });

    test("a 401 tells the caller once, and does not retry", async () =>
    {
        const seen: string[] = [];
        const { held, fetching } = built([{ status: 401, body: {} }], {
            onUnauthorized: (path: string) => seen.push(path),
        });

        await held.request({ method: "GET", path: "/me" }).catch(() => undefined);

        expect(seen).toEqual(["/me"]);
        expect(fetching.calls()).toHaveLength(1);
    });
});

describe("retrying", () =>
{
    test("retries an idempotent request until it succeeds", async () =>
    {
        const { held, fetching } = built([{ status: 500, body: {} }, { status: 500, body: {} }, { body: { ok: true } }], {
            sleep: async () => {},
        });

        await expect(held.request({ method: "GET", path: "/items" })).resolves.toEqual({ ok: true });

        expect(fetching.calls()).toHaveLength(3);
    });

    test("never retries a POST, so it cannot apply twice", async () =>
    {
        const { held, fetching } = built([{ status: 500, body: {} }], { sleep: async () => {} });

        await held.request({ method: "POST", path: "/items", body: { a: 1 } }).catch(() => undefined);

        expect(fetching.calls()).toHaveLength(1);
    });

    test("stops at the configured number of attempts", async () =>
    {
        const { held, fetching } = built([{ status: 500, body: {} }], { retries: 1, sleep: async () => {} });

        await held.request({ method: "GET", path: "/items" }).catch(() => undefined);

        expect(fetching.calls()).toHaveLength(2);
    });

    test("does not retry a refusal that trying again cannot fix", async () =>
    {
        const { held, fetching } = built([{ status: 404, body: {} }], { sleep: async () => {} });

        await held.request({ method: "GET", path: "/items" }).catch(() => undefined);

        expect(fetching.calls()).toHaveLength(1);
    });
});

describe("without a socket", () =>
{
    test("connect stays on http", async () =>
    {
        const { held } = built([{ body: {} }]);

        await expect(held.connect()).resolves.toBe("http");
        expect(held.carrying()).toBe("http");
    });

    test("subscribe succeeds and delivers nothing, so a caller needs no branch", async () =>
    {
        const { held } = built([{ body: {} }]);
        const heard: unknown[] = [];

        const subscription = held.subscribe("items", (message) => heard.push(message));

        expect(() => subscription.close()).not.toThrow();
        expect(heard).toEqual([]);
    });
});

describe("with a socket", () =>
{
    /** A transport whose socket the test drives. */
    function wired(answers: Answering[] = [{ body: {} }])
    {
        const fetching = fakeFetch(answers);

        restore = fetching.restore;

        const sockets: ReturnType<typeof fakeSocket>[] = [];
        const booted = boot(quiet, [
            plugin({
                baseUrl: "https://example.test/api",
                wsUrl: "wss://example.test/ws",
                openSocket: () =>
                {
                    const made = fakeSocket();

                    sockets.push(made);

                    return made;
                },
                sleep: async () => {},
            }),
        ]);

        const held = from(booted.host) as Transport;

        return { held, fetching, sockets };
    }

    test("connect opens one socket and answers ws", async () =>
    {
        const { held, sockets } = wired();

        const opening = held.connect();

        sockets[0]?.opened();

        await expect(opening).resolves.toBe("ws");
        expect(held.carrying()).toBe("ws");
    });

    test("connect twice opens one socket, not two", async () =>
    {
        const { held, sockets } = wired();

        const first = held.connect();
        const second = held.connect();

        sockets[0]?.opened();

        await Promise.all([first, second]);
        await held.connect();

        expect(sockets).toHaveLength(1);
    });

    test("a push reaches every subscriber on its channel", async () =>
    {
        const { held, sockets } = wired();
        const heard: unknown[] = [];

        const opening = held.connect();

        sockets[0]?.opened();
        await opening;

        held.subscribe("items", (message) => heard.push(message));
        sockets[0]?.delivered(JSON.stringify({ channel: "items", body: { id: 7 } }));

        expect(heard).toEqual([{ id: 7 }]);
    });

    test("a closed subscription stops hearing", async () =>
    {
        const { held, sockets } = wired();
        const heard: unknown[] = [];

        const opening = held.connect();

        sockets[0]?.opened();
        await opening;

        held.subscribe("items", (message) => heard.push(message)).close();
        sockets[0]?.delivered(JSON.stringify({ channel: "items", body: { id: 7 } }));

        expect(heard).toEqual([]);
    });

    test("a frame it cannot read is dropped rather than delivered", async () =>
    {
        const { held, sockets } = wired();
        const heard: unknown[] = [];

        const opening = held.connect();

        sockets[0]?.opened();
        await opening;

        held.subscribe("items", (message) => heard.push(message));
        sockets[0]?.delivered("not json at all");
        sockets[0]?.delivered(JSON.stringify({ nothing: true }));

        expect(heard).toEqual([]);
    });

    test("a dropped socket fails what was in flight rather than hanging", async () =>
    {
        const { held, sockets } = wired();

        const opening = held.connect();

        sockets[0]?.opened();
        await opening;

        const asked = held.request({ method: "POST", path: "/items", body: { a: 1 } });

        sockets[0]?.dropped();

        const failed = (await asked.catch((cause: unknown) => cause)) as TransportFault;

        expect(failed.code).toBe("NETWORK");
    });

    test("a dropped socket does not re-send a POST over http", async () =>
    {
        const { held, sockets, fetching } = wired();

        const opening = held.connect();

        sockets[0]?.opened();
        await opening;

        const asked = held.request({ method: "POST", path: "/items", body: { a: 1 } });

        sockets[0]?.dropped();
        await asked.catch(() => undefined);

        expect(fetching.calls()).toHaveLength(0);
    });

    test("requests move to http once the socket is gone", async () =>
    {
        const { held, sockets, fetching } = wired([{ body: { ok: true } }]);

        const opening = held.connect();

        sockets[0]?.opened();
        await opening;

        sockets[0]?.dropped();

        await expect(held.request({ method: "GET", path: "/items" })).resolves.toEqual({ ok: true });

        expect(held.carrying()).toBe("http");
        expect(fetching.calls()).toHaveLength(1);
    });

    test("close stops it for good", async () =>
    {
        const { held, sockets } = wired();

        const opening = held.connect();

        sockets[0]?.opened();
        await opening;

        held.close();

        expect(held.carrying()).toBe("http");
    });
});
