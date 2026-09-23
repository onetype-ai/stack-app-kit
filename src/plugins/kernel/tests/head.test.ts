import { describe, expect, test } from "vitest";

import { checkHead, createKernel, definePlugin, renderTags, tagsOf } from "../api";
import type { Route } from "../api";

function refused(head: unknown): string[]
{
    const checked = checkHead(head);

    return "problems" in checked ? checked.problems.map((one) => one.field) : [];
}

function tagsFor(head: unknown, title = "Items"): string
{
    const checked = checkHead(head);

    if ("problems" in checked)
    {
        throw new Error(JSON.stringify(checked.problems));
    }

    return renderTags(tagsOf(checked.head, title));
}

describe("a head", () =>
{
    test("refuses an address that is not absolute http or https, since a canonical or image is followed by crawlers", () =>
    {
        expect(refused({ canonical: "javascript:alert(1)" })).toEqual(["canonical"]);
        expect(refused({ canonical: "/items" })).toEqual(["canonical"]);
        expect(refused({ canonical: "ftp://shop.example/items" })).toEqual(["canonical"]);
        expect(refused({ openGraph: { image: "data:image/png;base64,AAAA" } })).toEqual(["openGraph.image"]);
    });

    test("refuses a key it does not know, so a misspelled field is not silently dropped", () =>
    {
        expect(refused({ descripton: "typo" })).toEqual(["head"]);
    });

    test("refuses text past its bound, a malformed locale and structured data that is not plain JSON", () =>
    {
        const circular: Record<string, unknown> = {};
        circular["self"] = circular;

        expect(refused({ title: "x".repeat(201), alternates: [{ locale: "english!", href: "https://example.test" }], jsonLd: [circular] }).sort()).toEqual([
            "alternates.0.locale",
            "jsonLd.0",
            "title",
        ]);
    });

    test("falls back to the route's title, and says robots as a crawler reads it", () =>
    {
        expect(tagsFor({ robots: { index: false } })).toBe("<title>Items</title>\n<meta name=\"robots\" content=\"noindex, follow\" data-kit-head>");
    });

    test("fills link-preview fields from the page's own title, description and canonical", () =>
    {
        const written = tagsFor({ description: "Chairs", canonical: "https://shop.example/items", openGraph: { type: "website" } });

        expect(written).toContain("<meta property=\"og:title\" content=\"Items\" data-kit-head>");
        expect(written).toContain("<meta property=\"og:description\" content=\"Chairs\" data-kit-head>");
        expect(written).toContain("<meta property=\"og:url\" content=\"https://shop.example/items\" data-kit-head>");
    });

    test("escapes what it writes, so a title cannot close its tag and a quote cannot end an attribute", () =>
    {
        const written = tagsFor({ title: "</title><script>alert(1)</script>", description: "say \"hi\" & 'bye'" });

        expect(written).toContain("<title>&lt;/title&gt;&lt;script&gt;alert(1)&lt;/script&gt;</title>");
        expect(written).toContain("content=\"say &quot;hi&quot; &amp; &#39;bye&#39;\"");
    });

    test("keeps structured data inside its script, whatever the data says", () =>
    {
        const written = tagsFor({ jsonLd: [{ name: "</script><script>alert(1)</script>", note: "a\u2028b" }] });

        expect(written).not.toContain("</script><script>");
        expect(written).toContain("\\u003c/script");
        expect(written).toContain("\\u2028");
    });
});

describe("a prerendered route", () =>
{
    const page = (): null => null;

    async function refusal(route: Route): Promise<unknown>
    {
        const kernel = createKernel({ plugins: [definePlugin("items", { version: "1.0.0", describe: "Lists items.", routes: [route] })] });

        return kernel.start().catch((error: unknown) => error);
    }

    test("may not be guarded, since a page written once is the same for every viewer", async () =>
    {
        expect(await refusal({ path: "/items", component: page, title: "Items", render: "prerender", requires: ["items.read"] })).toMatchObject({ message: expect.stringContaining("prerendered and guarded") });
        expect(await refusal({ path: "/items", component: page, title: "Items", render: "prerender", instead: () => undefined })).toMatchObject({ message: expect.stringContaining("prerendered and guarded") });
    });

    test("with parameters needs paths, and paths need parameters", async () =>
    {
        expect(await refusal({ path: "/items/$id", component: page, title: "Item", render: "prerender" })).toMatchObject({ message: expect.stringContaining("no paths saying which to write") });
        expect(await refusal({ path: "/items", component: page, title: "Items", paths: () => [] })).toMatchObject({ message: expect.stringContaining("holds no $parameter") });
    });

    test("names only the three ways a page renders", async () =>
    {
        expect(await refusal({ path: "/items", component: page, title: "Items", render: "edge" as "client" })).toMatchObject({ message: expect.stringContaining("not \"client\", \"prerender\" or \"server\"") });
    });

    test("starts when it holds no guard and says which paths to write", async () =>
    {
        expect(await refusal({ path: "/items/$id", component: page, title: "Item", render: "prerender", paths: () => [{ id: "1" }] })).toBeUndefined();
    });
});
