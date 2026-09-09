import { afterEach, describe, expect, test, vi } from "vitest";

import { definePlugin } from "../../kernel/api";
import { start } from "../internal/start";

afterEach(() =>
{
    vi.unstubAllGlobals();
});

function watchFetch(): { headers: () => Record<string, string> }
{
    let sent: Record<string, string> = {};

    vi.stubGlobal("fetch", (_url: string, options: { headers: Record<string, string> }) =>
    {
        sent = options.headers;

        return Promise.resolve(new Response("{}", { status: 200, headers: { "content-type": "application/json" } }));
    });

    return { headers: () => sent };
}

describe("what a plugin sends with every request", () =>
{
    test("reaches the request itself, not just the kernel", async () =>
    {
        const watching = watchFetch();

        const auth = definePlugin("auth", {
            version: "1.0.0",
            describe: "Holds a session key.",
            sends: () => ({ "x-session-key": "abc" }),
        });

        const app = await start({ plugins: [auth], transport: { baseUrl: "/api" } });

        await app.http.get("/anything");

        expect(watching.headers()["x-session-key"]).toBe("abc");

        await app.stop();
    });

    test("is read again on each request, so a key that changes is the one sent", async () =>
    {
        const watching = watchFetch();

        let key = "first";

        const auth = definePlugin("auth", {
            version: "1.0.0",
            describe: "Holds a session key that changes.",
            sends: () => ({ "x-session-key": key }),
        });

        const app = await start({ plugins: [auth], transport: { baseUrl: "/api" } });

        await app.http.get("/anything");
        expect(watching.headers()["x-session-key"]).toBe("first");

        key = "second";
        await app.http.get("/anything");
        expect(watching.headers()["x-session-key"]).toBe("second");

        await app.stop();
    });

    test("does not displace what the application passed itself", async () =>
    {
        const watching = watchFetch();

        const app = await start({
            plugins: [],
            transport: { baseUrl: "/api", headers: () => ({ "x-app": "mine" }) },
        });

        await app.http.get("/anything");

        expect(watching.headers()["x-app"]).toBe("mine");

        await app.stop();
    });
});
