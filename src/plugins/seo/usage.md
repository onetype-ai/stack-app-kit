# seo

## Description

What a crawler and a link preview read: a route's `head`, `sitemap.xml` and
`robots.txt`. The `server` plugin writes them into rendered pages.

## Purpose

A search engine indexes the first HTML and its tags, not what a script draws.
One validated head per route keeps every page's tags right by construction.

## Usage

```ts
routes: [{
    path: "/items/$id", component: ItemPage, title: "Item", render: "prerender",
    head: (ctx, { id }) => ({
        description: "One item.",
        canonical: `https://shop.example/items/${id}`,
        openGraph: { type: "product", image: "https://shop.example/items/1.jpg" },
        jsonLd: [{ "@context": "https://schema.org", "@type": "Product", name: "Item" }],
        alternates: [{ locale: "de", href: `https://shop.example/de/items/${id}` }],
    }),
}],
```

- `title` falls back to the route's. Every address is absolute http(s);
  text is bounded; JSON-LD is plain JSON. Tags are escaped, and JSON-LD
  cannot close its script.
- `robots: { index: false }` keeps a page out of `sitemapXml`; alternates
  become hreflang links in the page and the sitemap.
- In the browser, `RouteGuard` applies the head on every navigation and
  replaces only tags marked `data-kit-head`; pass it the router's `params`.

## Refuses

A head with an unknown key, a relative or non-http address, text past its
bound or JSON-LD that is not plain JSON, naming the field: a prerender stops,
and a rendered or browsed page keeps its title and logs it.
