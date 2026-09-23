import { afterEach, describe, expect, test } from "vitest";

import { definePlugin } from "../../kernel/api";
import type { Route } from "../../kernel/api";
import { start } from "../../mount/api";
import type { StartedApp } from "../../mount/api";
import { SeoFault } from "../../seo/api";
import { prerender } from "../react/server";

const template = "<html><head><!--kit-head--></head><body><div id=\"root\"><!--kit-app--></div></body></html>";

let running: StartedApp | undefined;

afterEach(async () =>
{
    await running?.stop();
    running = undefined;
});

async function started(routes: readonly Route[]): Promise<StartedApp>
{
    running = await start({
        plugins: [definePlugin("items", { version: "1.0.0", describe: "Lists items.", routes })],
        transport: { baseUrl: "/api" },
    });

    return running;
}

async function written(routes: readonly Route[], extra: { state?: () => unknown; disallow?: readonly string[]; template?: string } = {})
{
    const files = new Map<string, string>();
    const app = await started(routes);

    await prerender({
        app,
        template: extra.template ?? template,
        origin: "https://shop.example/",
        outDir: "dist",
        render: (path) => <p>page at {path}</p>,
        write: (file, contents) =>
        {
            files.set(file, contents);

            return Promise.resolve();
        },
        ...(extra.state !== undefined && { state: extra.state }),
        ...(extra.disallow !== undefined && { disallow: extra.disallow }),
    });

    return files;
}

const page = (): null => null;

describe("prerendering", () =>
{
    test("writes each prerendered page with its head and markup, and leaves client routes alone", async () =>
    {
        const files = await written([
            { path: "/", title: "Shop", component: page, render: "prerender", head: () => ({ description: "Chairs" }) },
            { path: "/account", title: "Account", component: page },
        ]);

        expect([...files.keys()].sort()).toEqual(["dist/_shell.html", "dist/_template.html", "dist/index.html", "dist/robots.txt", "dist/sitemap.xml"]);
        expect(files.get("dist/index.html")).toContain("<title>Shop</title>\n<meta name=\"description\" content=\"Chairs\" data-kit-head>");
        expect(files.get("dist/index.html")).toContain("<script type=\"application/json\" id=\"kit-state\" data-locale=\"en\">null</script>");
        expect(files.get("dist/index.html")).toContain("<div id=\"root\"><p>page at <!-- -->/</p></div>");
    });

    test("keeps the untouched shell apart, so prerendering / leaves a client-only route rendering its own page", async () =>
    {
        const files = await written([{ path: "/", title: "Shop", component: page, render: "prerender" }]);

        expect(files.get("dist/_shell.html")).toBe("<html><head></head><body><div id=\"root\"></div></body></html>");
        expect(files.get("dist/index.html")).toContain("page at");
        expect(files.get("dist/_template.html")).toBe(template);
        expect(files.get("dist/index.html")).toMatch(/^<html lang="en">/);
    });

    test("writes one page per set of parameters, loading each before it renders", async () =>
    {
        const loaded: string[] = [];
        const files = await written([{
            path: "/items/$id",
            title: "Item",
            component: page,
            render: "prerender",
            paths: () => [{ id: "1" }, { id: "blue chair" }],
            load: (_ctx, { id }) =>
            {
                loaded.push(id ?? "");
            },
        }]);

        expect(loaded).toEqual(["1", "blue chair"]);
        expect(files.has("dist/items/1/index.html")).toBe(true);
        expect(files.has("dist/items/blue%20chair/index.html")).toBe(true);
    });

    test("refuses every problem before writing anything", async () =>
    {
        const files = new Map<string, string>();
        const app = await started([
            { path: "/a", title: "A", component: page, render: "prerender", head: () => ({ canonical: "/relative" }) },
            { path: "/items/$id", title: "Item", component: page, render: "prerender", paths: () => [{ id: ".." }, {}] },
        ]);

        const failed = await prerender({
            app,
            template: "<html></html>",
            fallback: "../index.html",
            origin: "https://shop.example",
            outDir: "dist",
            render: () => null,
            write: (file, contents) =>
            {
                files.set(file, contents);

                return Promise.resolve();
            },
        }).catch((error: unknown) => error);

        expect(failed).toBeInstanceOf(SeoFault);
        expect((failed as SeoFault).problems).toEqual([
            expect.stringContaining("<!--kit-head--> and <!--kit-app-->"),
            expect.stringContaining("fallback \"../index.html\""),
            expect.stringContaining("head.canonical"),
            expect.stringContaining("\"..\" as id"),
            expect.stringContaining("no id"),
        ]);
        expect(files.size).toBe(0);
    });

    test("writes the cache state where no markup can end its script", async () =>
    {
        const files = await written(
            [{ path: "/", title: "Shop", component: page, render: "prerender" }],
            { state: () => ({ note: "</script><script>alert(1)</script>" }) },
        );

        expect(files.get("dist/index.html")).toContain("<script type=\"application/json\" id=\"kit-state\" data-locale=\"en\">{\"note\":\"\\u003c/script>\\u003cscript>alert(1)\\u003c/script>\"}</script>");
    });

    test("places markup that holds a replacement pattern as written", async () =>
    {
        const files = await written(
            [{ path: "/", title: "Shop", component: page, render: "prerender", head: () => ({ description: "Save $& now" }) }],
        );

        expect(files.get("dist/index.html")).toContain("content=\"Save $&amp; now\" data-kit-head");
    });

    test("writes a sitemap and robots.txt from what was prerendered", async () =>
    {
        const files = await written([
            { path: "/", title: "Shop", component: page, render: "prerender", head: () => ({ alternates: [{ locale: "de", href: "https://shop.example/de" }] }) },
            { path: "/drafts", title: "Drafts", component: page, render: "prerender", head: () => ({ robots: { index: false } }) },
        ], { disallow: ["/account"] });

        expect(files.get("dist/sitemap.xml")).toContain("<loc>https://shop.example/</loc>\n    <xhtml:link rel=\"alternate\" hreflang=\"de\" href=\"https://shop.example/de\"/>");
        expect(files.get("dist/sitemap.xml")).not.toContain("/drafts");
        expect(files.get("dist/robots.txt")).toBe("User-agent: *\nDisallow: /account\nAllow: /\nSitemap: https://shop.example/sitemap.xml\n");
    });
});
