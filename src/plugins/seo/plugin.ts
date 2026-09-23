import type { Host } from "../../kernel/host";
import type { HostPlugin } from "../../kernel/plugin";
import { NAME, robotsTxt, sitemapXml } from "./api";

/** Offers what writes a site's sitemap and robots.txt. */
export function seoPlugin(): HostPlugin
{
    return {
        name: NAME,
        needs: ["kernel"],

        boot: (host: Host) =>
        {
            host.offer(NAME, { sitemapXml, robotsTxt });
        },
    };
}
