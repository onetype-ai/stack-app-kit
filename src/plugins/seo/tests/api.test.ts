import { describe, expect, test } from "vitest";

import { robotsTxt, sitemapXml } from "../api";

describe("the sitemap and robots.txt", () =>
{
    test("escape what they write", () =>
    {
        expect(sitemapXml("https://shop.example", [{ path: "/a?b=1&c=2", isIndexed: true, alternates: [] }])).toContain("<loc>https://shop.example/a?b=1&amp;c=2</loc>");
        expect(robotsTxt("https://shop.example")).toBe("User-agent: *\nAllow: /\nSitemap: https://shop.example/sitemap.xml\n");
    });
});
