import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { ReactNode } from "react";
import { renderToString } from "react-dom/server";

import { checkHead, renderTags, tagsOf } from "../../kernel/api";
import type { HeadTag, RouteParams } from "../../kernel/api";
import type { StartedApp } from "../../mount/api";
import { SeoFault } from "../internal/faults";
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
     * Where the untouched template is written (`spa.html` by default), for the host to serve every path with no page of
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

    const fallback = options.fallback ?? "spa.html";

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
        const head = renderTags(page.tags) + (options.state === undefined ? "" : `\n${stateScript(options.state())}`);
        const file = join(options.outDir, page.path, "index.html");

        await write(file, options.template.replace(headMarker, () => head).replace(appMarker, () => markup));
        written.push({ path: page.path, file });
    }

    await write(join(options.outDir, "sitemap.xml"), sitemapXml(options.origin, planned.map((page) => page.sitemap)));
    await write(join(options.outDir, "robots.txt"), robotsTxt(options.origin, options.disallow));

    return written;
}
