import { z } from "zod";

const webAddress = z.url({ protocol: /^https?$/, hostname: z.regexes.domain }).max(2_000);

const plain = (most: number) => z.string().trim().min(1).max(most);

const locale = z.string().regex(/^(?:x-default|[a-zA-Z]{2,3}(?:-[A-Za-z0-9]{2,8})*)$/, "a BCP 47 language tag, or x-default");

const structuredData = z.record(z.string(), z.unknown()).refine((value) =>
{
    try
    {
        return JSON.stringify(value).length <= 50_000;
    }
    catch
    {
        return false;
    }
}, "plain JSON of at most 50 000 characters");

export const headSchema = z.strictObject({
    title: plain(200).optional(),
    description: plain(500).optional(),
    canonical: webAddress.optional(),
    robots: z.strictObject({ index: z.boolean().default(true), follow: z.boolean().default(true) }).optional(),
    openGraph: z.strictObject({
        type: z.enum(["website", "article", "product", "profile", "book", "video.other", "music.song"]).optional(),
        title: plain(200).optional(),
        description: plain(500).optional(),
        image: webAddress.optional(),
        url: webAddress.optional(),
        siteName: plain(100).optional(),
        locale: locale.optional(),
    }).optional(),
    twitter: z.strictObject({
        card: z.enum(["summary", "summary_large_image"]).optional(),
        site: z.string().regex(/^@\w{1,15}$/, "an @handle").optional(),
        image: webAddress.optional(),
    }).optional(),
    jsonLd: z.array(structuredData).max(10).optional(),
    alternates: z.array(z.strictObject({ locale, href: webAddress })).max(100).optional(),
});

/** What a page says about itself to a search engine and a link preview. Every field is optional; `title` falls back to the route's. */
export type Head = z.input<typeof headSchema>;

/** One element of `<head>`, as data: rendered to a string on a server, created as a node in a browser. */
export type HeadTag =
    | { tag: "title"; text: string }
    | { tag: "meta"; attributes: Readonly<Record<string, string>> }
    | { tag: "link"; attributes: Readonly<Record<string, string>> }
    | { tag: "script"; attributes: Readonly<Record<string, string>>; text: string };

export type HeadProblem = { field: string; problem: string };

export function checkHead(head: unknown): { head: z.output<typeof headSchema> } | { problems: HeadProblem[] }
{
    const parsed = headSchema.safeParse(head ?? {});

    if (parsed.success)
    {
        return { head: parsed.data };
    }

    return {
        problems: parsed.error.issues.map((issue) => ({ field: issue.path.join(".") || "head", problem: issue.message })),
    };
}

function meta(key: "name" | "property", name: string, content: string | undefined): HeadTag[]
{
    return content === undefined ? [] : [{ tag: "meta", attributes: { [key]: name, content } }];
}

export function tagsOf(head: z.output<typeof headSchema>, fallbackTitle: string): HeadTag[]
{
    const title = head.title ?? fallbackTitle;
    const graph = head.openGraph;
    const robots = head.robots === undefined
        ? undefined
        : `${head.robots.index ? "index" : "noindex"}, ${head.robots.follow ? "follow" : "nofollow"}`;

    return [
        { tag: "title", text: title },
        ...meta("name", "description", head.description),
        ...meta("name", "robots", robots),
        ...(head.canonical === undefined ? [] : [{ tag: "link" as const, attributes: { rel: "canonical", href: head.canonical } }]),
        ...(head.alternates ?? []).map((alternate) => ({ tag: "link" as const, attributes: { rel: "alternate", hreflang: alternate.locale, href: alternate.href } })),
        ...(graph === undefined ? [] : [
            ...meta("property", "og:title", graph.title ?? title),
            ...meta("property", "og:description", graph.description ?? head.description),
            ...meta("property", "og:type", graph.type),
            ...meta("property", "og:image", graph.image),
            ...meta("property", "og:url", graph.url ?? head.canonical),
            ...meta("property", "og:site_name", graph.siteName),
            ...meta("property", "og:locale", graph.locale),
        ]),
        ...(head.twitter === undefined ? [] : [
            ...meta("name", "twitter:card", head.twitter.card),
            ...meta("name", "twitter:site", head.twitter.site),
            ...meta("name", "twitter:image", head.twitter.image),
        ]),
        ...(head.jsonLd ?? []).map((data) => ({ tag: "script" as const, attributes: { type: "application/ld+json" }, text: JSON.stringify(data) })),
    ];
}

const escapes: Readonly<Record<string, string>> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" };

function escaped(text: string): string
{
    return text.replace(/[&<>"']/g, (character) => escapes[character] ?? character);
}

function scriptSafe(json: string): string
{
    return json.replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
}

export function renderTags(tags: readonly HeadTag[]): string
{
    return tags.map((one) =>
    {
        if (one.tag === "title")
        {
            return `<title>${escaped(one.text)}</title>`;
        }

        const attributes = Object.entries(one.attributes).map(([key, value]) => ` ${key}="${escaped(value)}"`).join("");

        if (one.tag === "script")
        {
            return `<script${attributes}>${scriptSafe(one.text)}</script>`;
        }

        return `<${one.tag}${attributes}>`;
    }).join("\n");
}
