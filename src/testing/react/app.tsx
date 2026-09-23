import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRootRoute, createRoute, createRouter, Navigate, Outlet, RouterProvider } from "@tanstack/react-router";
import { cleanup, render } from "@testing-library/react";
import { afterEach, vi } from "vitest";

// Through the package, never its sources: bundling them would give this entry its own kernel context, which a
// page's usePlugin from "@onetype/stack-app-kit/react" could never see.
import { cache, start } from "@onetype/stack-app-kit";
import { KernelProvider, NotFound, RouteGuard } from "@onetype/stack-app-kit/react";

import type { Plugin, RouterOptions, StartedApp, StartOptions } from "@onetype/stack-app-kit";

/** One request the app made, as the api would read it: the path without the api base. */
export type AppCall = {
    method: string;
    path: string;
    query: Readonly<Record<string, string>>;
    body: unknown;
    headers: Headers;
};

/** What the api answers; a 204 carries no body. */
export type AppAnswer = { status: number; body?: unknown };

/** An answer, or one worked out from the call; `undefined` falls through to the next source. */
export type AppAnswering = AppAnswer | ((call: AppCall) => AppAnswer | undefined);

/** Answers keyed `"METHOD /path"`, or `"*"` for any call nothing else answers. */
export type AppAnswers = Readonly<Record<string, AppAnswering>>;

export type OpenAppOptions = {
    /** Where the browser is when the app starts. */
    path: string;
    plugins: readonly Plugin[];

    /** Asked first, then `answers["*"]`, then `preset`; nothing answering is a 404 `NOT_FOUND`. */
    answers?: AppAnswers | undefined;

    /** Answers shared by many tests, overridden by `answers`. */
    preset?: AppAnswers | undefined;
    config?: Readonly<Record<string, unknown>> | undefined;
    apiBase?: string | undefined;
    staleTimeMs?: number | undefined;
    permissions?: StartOptions["permissions"] | undefined;
    log?: StartOptions["log"] | undefined;

    /** Merged over `{ baseUrl: apiBase, retries: 0 }`. */
    transport?: Partial<StartOptions["transport"]> | undefined;

    /** Where calls are recorded, so several apps in one test can share one list. */
    calls?: AppCall[] | undefined;
};

export type OpenedApp = {
    app: StartedApp;
    calls: AppCall[];
    client: QueryClient;
};

const running: StartedApp[] = [];

const missing: AppAnswer = { status: 404, body: { code: "NOT_FOUND", message: "Nothing answers this in the test." } };

afterEach(async () =>
{
    cleanup();
    await Promise.all(running.splice(0).map((app) => app.stop()));
    vi.unstubAllGlobals();
});

/** A 200 carrying `body`. */
export const ok = (body: unknown): AppAnswer => ({ status: 200, body });

const answerOf = (answering: AppAnswering | undefined, call: AppCall): AppAnswer | undefined =>
{
    return typeof answering === "function" ? answering(call) : answering;
};

/**
 * Starts the application as a browser would (router, query cache, kernel) against answers instead of an api, and
 * renders it at `path`. After each test, what it rendered unmounts, every app it opened stops, and `fetch` is restored.
 */
export async function openApp({ path, plugins, answers = {}, preset = {}, config = {}, apiBase = "/api", staleTimeMs = 30_000, permissions, log, transport = {}, calls = [] }: OpenAppOptions): Promise<OpenedApp>
{

    vi.stubGlobal("fetch", (input: string | URL | Request, init?: RequestInit): Promise<Response> =>
    {
        const url = new URL(input instanceof Request ? input.url : String(input), "http://localhost");
        const call: AppCall = {
            method: init?.method ?? "GET",
            path: url.pathname.startsWith(apiBase) ? url.pathname.slice(apiBase.length) : url.pathname,
            query: Object.fromEntries(url.searchParams),
            body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
            headers: new Headers(init?.headers),
        };
        const key = `${call.method} ${call.path}`;

        calls.push(call);

        const answer = answerOf(answers[key], call) ?? answerOf(answers["*"], call) ?? answerOf(preset[key], call) ?? missing;

        return Promise.resolve(new Response(answer.status === 204 ? null : JSON.stringify(answer.body ?? {}), { status: answer.status, headers: { "content-type": "application/json" } }));
    });
    // jsdom has no scrollTo, and the router restores scroll on every visit
    vi.stubGlobal("scrollTo", () => {});
    window.history.replaceState(null, "", path);

    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: staleTimeMs } } });
    const app = await start({
        plugins: [...plugins],
        config,
        transport: { baseUrl: apiBase, retries: 0, ...transport },
        cache: cache.fromQueries(client),
        ...(permissions === undefined ? {} : { permissions }),
        ...(log === undefined ? {} : { log }),
        router: {
            building: { createRootRoute, createRoute, createRouter } as unknown as RouterOptions,
            missing: NotFound,
            outlet: Outlet,
            wrap: (Frame, Page) => (Frame === undefined ? Page : () => <Frame><Page /></Frame>),
            landing: (to) => () => <Navigate to={to} replace />,
            guard: (route) => () => <RouteGuard route={route} send={(to) => <Navigate to={to} replace />} />,
        },
    });

    running.push(app);
    render(
        <QueryClientProvider client={client}>
            <KernelProvider kernel={app.kernel}>
                <RouterProvider router={app.router as never} />
            </KernelProvider>
        </QueryClientProvider>,
    );

    return { app, calls, client };
}
