import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, parse, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { ReactNode } from "react";
import { renderToString } from "react-dom/server";

import { checkHead, renderTags, tagsOf } from "../../kernel/api";
import type { HeadTag, RouteParams } from "../../kernel/api";
import type { StartedApp } from "../../mount/api";
import { SeoFault, robotsTxt, sitemapXml } from "../../seo/api";
import type { SitemapPage } from "../../seo/api";
import { matchRoute } from "../internal/match";
import { filled } from "../internal/paths";

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
        if (app.router !== undefined)
        {
            const url = new URL(request.url);

            await app.visit(url.pathname + url.search);
        }

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

/** What a build hands the entry `prerenderOnBuild` built: the client's template, where the site is served, and where pages go. */
export type BuildOutput = {
    template: string;
    origin: string;
    outDir: string;
};

/** What `prerenderApp` needs: the same app and tree the browser starts, built once for every page. */
export type PrerenderAppOptions = {
    /** Starts the app as the browser does, with one query client given to `cache.fromQueries` and read by `state`. */
    start: () => Promise<StartedApp>;

    /** The one tree `main.tsx` also renders, so server and client cannot drift. */
    tree: (app: StartedApp) => ReactNode;

    state?: (() => unknown) | undefined;
    disallow?: readonly string[] | undefined;
};

/** The default export of a prerender entry: starts the app once, then writes every prerendered route through `prerender`. */
export function prerenderApp(options: PrerenderAppOptions): (output: BuildOutput) => Promise<readonly PrerenderedPage[]>
{
    return async (output) =>
    {
        const app = await options.start();

        try
        {
            return await prerender({
                app,
                template: output.template,
                origin: output.origin,
                outDir: output.outDir,
                render: async (path) =>
                {
                    await app.visit(path);

                    return options.tree(app);
                },
                ...(options.state !== undefined && { state: options.state }),
                ...(options.disallow !== undefined && { disallow: options.disallow }),
            });
        }
        finally
        {
            await app.stop();
        }
    };
}

/** What `prerenderOnBuild` takes: the entry whose default export `prerenderApp` answered, and where the site is served. */
export type PrerenderOnBuildOptions = {
    entry: string;
    origin: string | undefined;
};

type ResolvedBuildConfig = {
    root: string;
    mode: string;
    configFile: string | false | undefined;
    command: string;
    build: { outDir: string; ssr: unknown };
};

type ViteBuild = { build: (config: Record<string, unknown>) => Promise<unknown> };

/**
 * A Vite plugin: once the client is built, builds `entry` for the server, runs its default export with the built
 * `index.html`, and removes the server build. Skips the nested server build it starts, and every command but `build`.
 * In a production build, an origin that is missing or not absolute http(s) stops the build.
 */
export function prerenderOnBuild(options: PrerenderOnBuildOptions)
{
    let config: ResolvedBuildConfig | undefined;

    return {
        name: "stack-app-kit:prerender",

        configResolved: (resolved: ResolvedBuildConfig) =>
        {
            config = resolved;

            const isOwnServerBuild = resolved.build.ssr !== undefined && resolved.build.ssr !== false;

            if (resolved.command !== "build" || isOwnServerBuild || resolved.mode !== "production")
            {
                return;
            }

            if (options.origin === undefined || !/^https?:\/\/[^/\s]+$/.test(options.origin.replace(/\/+$/, "")))
            {
                throw new SeoFault([`origin "${options.origin ?? ""}" must be an absolute http(s) address like https://shop.example, for canonical links and the sitemap`]);
            }
        },

        closeBundle: async () =>
        {
            const built = config;

            if (built === undefined || built.command !== "build" || (built.build.ssr !== undefined && built.build.ssr !== false))
            {
                return;
            }

            const outDir = resolve(built.root, built.build.outDir);
            const serverDir = join(outDir, ".prerender");
            const vite = await import("vite") as unknown as ViteBuild;

            await vite.build({
                root: built.root,
                mode: built.mode,
                configFile: built.configFile,
                logLevel: "warn",
                build: { ssr: options.entry, outDir: serverDir, emptyOutDir: true, copyPublicDir: false },
            });

            try
            {
                const name = parse(options.entry).name;
                const file = (await readdir(serverDir)).find((one) => parse(one).name === name && /\.m?js$/.test(one));

                if (file === undefined)
                {
                    throw new SeoFault([`the server build of "${options.entry}" wrote no ${name}.js to ${serverDir}`]);
                }

                const module = await import(pathToFileURL(join(serverDir, file)).href) as { default?: (output: BuildOutput) => Promise<unknown> };

                if (typeof module.default !== "function")
                {
                    throw new SeoFault([`"${options.entry}" must default-export prerenderApp({ ... })`]);
                }

                await module.default({
                    template: await readFile(join(outDir, "index.html"), "utf8"),
                    origin: options.origin ?? "http://localhost",
                    outDir,
                });
            }
            finally
            {
                await rm(serverDir, { recursive: true, force: true });
            }
        },
    };
}

/** A `respond` for `handle` that renders `tree` into `template`, as a prerender does: the router already stands at the path. */
export function respondWith(options: { template: string; tree: (app: StartedApp) => ReactNode }): (app: StartedApp) => Promise<Response>
{
    return (app) =>
    {
        const markup = renderToString(options.tree(app));
        const page = options.template.replace(headMarker, () => "").replace(appMarker, () => markup);

        return Promise.resolve(new Response(page, { status: 200, headers: { "content-type": "text/html; charset=utf-8" } }));
    };
}
