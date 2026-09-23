import { afterEach, describe, expect, test, vi } from "vitest";

import { definePlugin } from "../../kernel/api";
import type { Route } from "../../kernel/api";
import { start } from "../../mount/api";
import type { StartedApp } from "../../mount/api";
import { handle } from "../react/server";
import type { Session } from "../react/server";

afterEach(() =>
{
    vi.unstubAllGlobals();
});

type Viewer = { name: string };

const sawCookies: string[] = [];
let stopped = 0;

function answering(): void
{
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) =>
    {
        const cookie = new Headers(init.headers).get("cookie") ?? "";

        sawCookies.push(cookie);

        const name = cookie.replace("session=", "");

        await new Promise((resolve) => setTimeout(resolve, name === "slow" ? 40 : 5));

        return new Response(JSON.stringify({ name }), { status: 200, headers: { "content-type": "application/json" } });
    });
}

function profiles(routes: (seen: { viewer?: Viewer }) => readonly Route[])
{
    const seen: { viewer?: Viewer } = {};

    return definePlugin("profiles", {
        version: "1.0.0",
        describe: "Shows who is looking.",
        routes: routes(seen),
        services: () => ({ viewer: () => seen.viewer }),
        teardown: () =>
        {
            stopped += 1;
        },
    });
}

function serverRoutes(seen: { viewer?: Viewer }): readonly Route[]
{
    return [
        {
            path: "/me",
            title: "Me",
            component: () => null,
            render: "server",
            load: async (ctx) =>
            {
                seen.viewer = await ctx.http.get("/me") as Viewer;
            },
            head: () => ({ description: `Page of ${seen.viewer?.name ?? "nobody"}` }),
        },
        { path: "/settings", title: "Settings", component: () => null },
    ];
}

function starting(session: Session): Promise<StartedApp>
{
    return start({ plugins: [profiles(serverRoutes)], transport: { baseUrl: "http://api.test", headers: () => session.headers, retries: 0 } });
}

async function respond(app: StartedApp): Promise<Response>
{
    const viewer = app.kernel.context("profiles").use<{ viewer: () => Viewer | undefined }>("profiles").viewer();

    return new Response(`<html><head><meta charset="utf-8"></head><body>hello ${viewer?.name ?? "nobody"}</body></html>`, { headers: { "content-type": "text/html" } });
}

function requestFor(path: string, headers: Record<string, string> = {}, method = "GET"): Request
{
    return new Request(`http://site.test${path}`, { method, headers });
}

describe("rendering a request on the server", () =>
{
    test("writes the page's checked head before the head closes, and hands the viewer's cookie to the api", async () =>
    {
        answering();
        sawCookies.length = 0;

        const response = await handle(requestFor("/me", { cookie: "session=ana" }), { start: starting, respond, state: () => ({ items: [1] }) });
        const html = await response?.text();

        expect(html).toBe("<html><head><meta charset=\"utf-8\"><title>Me</title>\n<meta name=\"description\" content=\"Page of ana\" data-kit-head>\n<script type=\"application/json\" id=\"kit-state\">{\"items\":[1]}</script></head><body>hello ana</body></html>");
        expect(sawCookies).toEqual(["session=ana"]);
    });

    test("keeps two viewers apart when their requests overlap", async () =>
    {
        answering();
        sawCookies.length = 0;

        const [slow, quick] = await Promise.all([
            handle(requestFor("/me", { cookie: "session=slow" }), { start: starting, respond }),
            handle(requestFor("/me", { cookie: "session=quick" }), { start: starting, respond }),
        ]);
        const [slowHtml, quickHtml] = await Promise.all([slow?.text(), quick?.text()]);

        expect(slowHtml).toContain("Page of slow");
        expect(slowHtml).toContain("hello slow");
        expect(slowHtml).not.toContain("quick");
        expect(quickHtml).toContain("Page of quick");
        expect(quickHtml).toContain("hello quick");
        expect(quickHtml).not.toContain("slow");
        expect(sawCookies.sort()).toEqual(["session=quick", "session=slow"]);
    });

    test("forwards only the cookie and the language, never another credential", async () =>
    {
        const sessions: Session[] = [];

        await handle(requestFor("/nowhere", { cookie: "session=ana", "accept-language": "de", authorization: "Bearer secret", "x-forwarded-for": "10.0.0.1" }), {
            start: (session) =>
            {
                sessions.push(session);

                return starting(session);
            },
            respond,
        });

        expect(sessions).toEqual([{ headers: { cookie: "session=ana", "accept-language": "de" } }]);
    });

    test("renders nothing but a read, and nothing a server route does not declare, stopping the app it started", async () =>
    {
        answering();
        stopped = 0;
        let started = 0;
        const counting = (session: Session): Promise<StartedApp> =>
        {
            started += 1;

            return starting(session);
        };

        const posted = await handle(requestFor("/me", {}, "POST"), { start: counting, respond });
        const clientOnly = await handle(requestFor("/settings"), { start: counting, respond });
        const unknown = await handle(requestFor("/missing"), { start: counting, respond });

        expect([posted, clientOnly, unknown]).toEqual([undefined, undefined, undefined]);
        expect(started).toBe(2);
        expect(stopped).toBe(2);
    });

    test("hands a route its decoded parameters, and matches no route for a segment that does not decode", async () =>
    {
        answering();
        const withItem = (session: Session): Promise<StartedApp> => start({
            plugins: [profiles(() => [{ path: "/items/$id", title: "Item", component: () => null, render: "server", head: (_ctx, { id }) => ({ description: `Item ${id ?? "?"}` }) }])],
            transport: { baseUrl: "http://api.test", headers: () => session.headers },
        });

        const decoded = await (await handle(requestFor("/items/blue%20chair"), { start: withItem, respond }))?.text();
        const broken = await handle(requestFor("/items/%E0"), { start: withItem, respond });

        expect(decoded).toContain("content=\"Item blue chair\"");
        expect(broken).toBeUndefined();
    });

    test("stops the app once the page has streamed, not before", async () =>
    {
        answering();
        stopped = 0;

        const response = await handle(requestFor("/me", { cookie: "session=ana" }), { start: starting, respond });
        const beforeReading = stopped;
        await response?.text();

        expect(beforeReading).toBe(0);
        expect(stopped).toBe(1);
    });

    test("falls back to the title when a head is refused, logging why, rather than failing the page", async () =>
    {
        answering();
        const logged: string[] = [];
        const broken = (session: Session): Promise<StartedApp> => start({
            plugins: [profiles(() => [{ path: "/me", title: "Me", component: () => null, render: "server", head: () => ({ canonical: "/relative" }) }])],
            transport: { baseUrl: "http://api.test", headers: () => session.headers },
            log: { debug: () => {}, info: () => {}, warn: () => {}, error: (line) => logged.push(line) },
        });

        const response = await handle(requestFor("/me"), { start: broken, respond });
        const html = await response?.text();

        expect(response?.status).toBe(200);
        expect(html).toContain("<title>Me</title>\n<script");
        expect(logged).toEqual([expect.stringContaining("head of \"/me\" was refused")]);
    });
});
