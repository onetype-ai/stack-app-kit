import type { Host } from "../../kernel/host";
import type { robotsTxt, sitemapXml } from "./internal/sitemap";

/** What this plugin offers itself as. */
export const NAME = "seo";

/** What `seo.from(host)` answers. */
export type Seo = {
    /** A sitemap of every indexed page, with hreflang alternates. */
    sitemapXml: typeof sitemapXml;

    /** A robots.txt allowing everything but `disallow`, naming the sitemap. */
    robotsTxt: typeof robotsTxt;
};

/** The seo helpers, for a plugin that declared "seo" in needs. */
export function from(host: Host): Seo | undefined
{
    return host.take<Seo>(NAME);
}

export { robotsTxt, sitemapXml } from "./internal/sitemap";
export type { SitemapPage } from "./internal/sitemap";
export { SeoFault } from "./internal/faults";
