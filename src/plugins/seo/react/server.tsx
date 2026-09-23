import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { ReactNode } from "react";
import { renderToString } from "react-dom/server";

import { checkHead, renderTags, tagsOf } from "../../kernel/api";
import type { HeadTag, RouteParams } from "../../kernel/api";
import type { StartedApp } from "../../mount/api";
import { SeoFault } from "../internal/faults";
import { matchRoute } from "../internal/match";
import { filled } from "../internal/paths";
import { robotsTxt, sitemapXml } from "../internal/sitemap";
import type { SitemapPage } from "../internal/sitemap";

/** What `prerender` needs: a started app, how to render one path, and where the pages go. */
export type PrerenderOptions = {
    app: StartedApp;

    /** The same tree the browser renders, for one path: typically a router on memory history, loaded. */
    render: (path: string) => ReactNode | Promise<ReactNode>;

    /** The built `index.html`, holding `<!--kit-head-->` and `<!--kit-app-->`. */
    template: string;

    /** Where the site is served, for the sitemap: `https://shop.example`. */
    origin: string;
    outDir: string;

    /** What the client hydrates its cache from, read after every page loaded: `() => dehydrate(queryClient)`. */
    state?: (() => unknown) | undefined;

    /** Paths robots.txt asks crawlers to leave alone: the client-only part of the site. */
    disallow?: readonly string[] | undefined;

    /**
     * Where the untouched template is written (`_shell.html` by default), for the host to serve every path with no page of
     * its own. Prerendering `/` rewrites `index.html`, so falling back to it would hand a client route the home page.
     */
    fallback?: string | undefined;

    /** Writes one file; the file system by default, a map in a test. */
    write?: ((file: string, contents: string) => Promise<void>) | undefined;
};

/** One page written, and what it said about itself. */
export type PrerenderedPage = {
    path: string;
    file: string;
};

const headMarker = "<!--kit-head-->";
const appMarker = "<!--kit-app-->";

type Planned = { path: string; tags: HeadTag[]; sitemap: SitemapPage; load: () => Promise<void> };

async function toDisk(file: string, contents: string): Promise<void>
{
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, contents);
}

function stateScript(state: unknown): string
{
    const json = JSON.stringify(state ?? null).replace(/</g, "\\u003c");

    return `<script type="application/json" id="kit-state">${json}</script>`;
}

async function plan(app: StartedApp, problems: string[]): Promise<Planned[]>
{
    const planned: Planned[] = [];

    for (const route of app.kernel.routes().filter((one) => one.render === "prerender"))
    {
        const ctx = app.kernel.context(route.plugin);
        const sets: readonly RouteParams[] = route.paths === undefined ? [{}] : await route.paths(ctx);

        for (const params of sets)
        {
            const target = filled(route.path, params);

            if ("problem" in target)
            {
                problems.push(target.problem);

                continue;
            }

            const checked = checkHead(await route.head?.(ctx, params));

            if ("problems" in checked)
            {
                problems.push(...checked.problems.map((one) => `"${target.path}" head.${one.field}: ${one.problem}`));

                continue;
            }

            planned.push({
                path: target.path,
                tags: tagsOf(checked.head, route.title),
                sitemap: { path: target.path, isIndexed: checked.head.robots?.index !== false, alternates: checked.head.alternates ?? [] },
                load: async () =>
                {
                    await route.load?.(ctx, params);
                },
            });
        }
    }

    return planned;
}

/**
 * Writes every route declared `render: "prerender"`, once per set its `paths` answer, as `<outDir><path>/index.html`,
 * then `sitemap.xml` and `robots.txt`. Every head is validated and every path checked before anything is written;
 * a problem anywhere throws `SeoFault` naming them all.
 */
export async function prerender(options: PrerenderOptions): Promise<readonly PrerenderedPage[]>
{
    const problems: string[] = [];
    const write = options.write ?? toDisk;

    if (!options.template.includes(headMarker) || !options.template.includes(appMarker))
    {
        problems.push(`the template must hold both ${headMarker} and ${appMarker}`);
    }

    const fallback = options.fallback ?? "_shell.html";

    if (!/^[\w-]+\.html$/.test(fallback) || fallback === "index.html")
    {
        problems.push(`fallback "${fallback}" must be a file name ending in .html, other than index.html, with no folder`);
    }

    const planned = await plan(options.app, problems);

    if (problems.length > 0)
    {
        throw new SeoFault(problems);
    }

    const written: PrerenderedPage[] = [];

    await write(join(options.outDir, fallback), options.template.replace(headMarker, "").replace(appMarker, ""));

    for (const page of planned)
    {
        await page.load();

        const markup = renderToString(await options.render(page.path));
        const head = `${renderTags(page.tags)}\n${stateScript(options.state?.())}`;
        const file = join(options.outDir, page.path, "index.html");

        await write(file, options.template.replace(headMarker, () => head).replace(appMarker, () => markup));
        written.push({ path: page.path, file });
    }

    await write(join(options.outDir, "sitemap.xml"), sitemapXml(options.origin, planned.map((page) => page.sitemap)));
    await write(join(options.outDir, "robots.txt"), robotsTxt(options.origin, options.disallow));

    return written;
}

/** What a request forwards to the api on the viewer's behalf: the cookie and the language, nothing else. */
export type Session = {
    headers: Readonly<Record<string, string>>;
};

/** What `handle` needs: a fresh app per request, and how that app renders its document. */
export type HandleOptions = {
    /** Starts the app for one viewer: pass `session.headers` as the transport's headers, so the api sees who is asking. */
    start: (session: Session) => Promise<StartedApp>;

    /** Renders the whole document with the app's router (a streamed `Response`); the kit writes the head into it. */
    respond: (app: StartedApp, request: Request) => Promise<Response>;

    /** What the client hydrates its cache from, read once the page loaded. */
    state?: ((app: StartedApp) => unknown) | undefined;
};

const forwarded = ["cookie", "accept-language"] as const;

function sessionOf(request: Request): Session
{
    const headers: Record<string, string> = {};

    for (const name of forwarded)
    {
        const value = request.headers.get(name);

        if (value !== null)
        {
            headers[name] = value;
        }
    }

    return { headers };
}

function withHead(body: ReadableStream<Uint8Array>, head: string, done: () => Promise<void>): ReadableStream<Uint8Array>
{
    const reader = body.getReader();
    const decoder = new TextDecoder();
    const encoder = new TextEncoder();
    let pending = "";
    let isWritten = false;
    let isDone = false;

    const finish = async (): Promise<void> =>
    {
        if (!isDone)
        {
            isDone = true;
            await done();
        }
    };

    return new ReadableStream<Uint8Array>({
        pull: async (controller) =>
        {
            const next = await reader.read();

            if (next.done)
            {
                if (!isWritten && pending !== "")
                {
                    controller.enqueue(encoder.encode(pending + decoder.decode()));
                }

                controller.close();
                await finish();

                return;
            }

            if (isWritten)
            {
                controller.enqueue(next.value);

                return;
            }

            pending += decoder.decode(next.value, { stream: true });

            const closing = pending.indexOf("</head>");

            if (closing !== -1)
            {
                isWritten = true;
                controller.enqueue(encoder.encode(pending.slice(0, closing) + head + pending.slice(closing)));
                pending = "";
            }
        },
        cancel: async (reason) =>
        {
            await reader.cancel(reason);
            await finish();
        },
    });
}

/**
 * Renders a route declared `render: "server"` for one request, with a kit of its own: the api sees this viewer's cookie
 * and no other request's, and the head is resolved, checked and written before the page streams. Answers undefined for
 * a request it does not render (not GET or HEAD, or no server route matches), for the host to serve `_shell.html`.
 */
export async function handle(request: Request, options: HandleOptions): Promise<Response | undefined>
{
    if (request.method !== "GET" && request.method !== "HEAD")
    {
        return undefined;
    }

    const app = await options.start(sessionOf(request));
    const stop = async (): Promise<void> =>
    {
        await app.stop();
    };

    try
    {
        const found = matchRoute(app.kernel.routes().filter((route) => route.render === "server"), new URL(request.url).pathname);

        if (found === undefined)
        {
            await stop();

            return undefined;
        }

        const ctx = app.kernel.context(found.route.plugin);

        await found.route.load?.(ctx, found.params);

        const checked = checkHead(await found.route.head?.(ctx, found.params));
        let tags: HeadTag[] = [{ tag: "title", text: found.route.title }];

        if ("problems" in checked)
        {
            ctx.log.error(`head of "${found.route.path}" was refused`, { problems: checked.problems.map((one) => `${one.field}: ${one.problem}`).join("; ") });
        }
        else
        {
            tags = tagsOf(checked.head, found.route.title);
        }

        const head = `${renderTags(tags)}\n${stateScript(options.state?.(app))}`;
        const response = await options.respond(app, request);

        if (response.body === null)
        {
            await stop();

            return response;
        }

        const headers = new Headers(response.headers);

        headers.delete("content-length");

        return new Response(withHead(response.body, head, stop), { status: response.status, headers });
    }
    catch (cause)
    {
        await stop();

        throw cause;
    }
}
