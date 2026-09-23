export type SitemapPage = {
    path: string;
    isIndexed: boolean;
    alternates: readonly { locale: string; href: string }[];
};

const xmlEscapes: Readonly<Record<string, string>> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&apos;" };

function xml(text: string): string
{
    return text.replace(/[&<>"']/g, (character) => xmlEscapes[character] ?? character);
}

export function sitemapXml(origin: string, pages: readonly SitemapPage[]): string
{
    const base = origin.replace(/\/+$/, "");
    const entries = pages
        .filter((page) => page.isIndexed)
        .map((page) =>
        {
            const links = page.alternates.map((alternate) => `\n    <xhtml:link rel="alternate" hreflang="${xml(alternate.locale)}" href="${xml(alternate.href)}"/>`).join("");

            return `  <url>\n    <loc>${xml(base + page.path)}</loc>${links}\n  </url>`;
        });

    return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${entries.join("\n")}\n</urlset>\n`;
}

export function robotsTxt(origin: string, disallow: readonly string[] = []): string
{
    const base = origin.replace(/\/+$/, "");

    return ["User-agent: *", ...disallow.map((path) => `Disallow: ${path}`), "Allow: /", `Sitemap: ${base}/sitemap.xml`, ""].join("\n");
}
