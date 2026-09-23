# seo

## Description

Writes a route declared `render: "prerender"` as HTML at build time, with its
head, plus `sitemap.xml` and `robots.txt`. Every other route stays a client
page served by the SPA's `index.html`.

## Purpose

A crawler and a link preview read the first HTML, not what a script renders.

## Usage

```ts
// a plugin
routes: [{
    path: "/items/$id", component: ItemPage, title: "Item", render: "prerender",
    paths: async (ctx) => (await ctx.http.get("/items")).map(({ id }) => ({ id })),
    load: (ctx, { id }) => ctx.http.get(`/items/${id}`),
    head: (ctx, { id }) => ({ description: "…", canonical: `https://shop.example/items/${id}` }),
}],

// prerender.ts, run by Node after `vite build`
const app = await start({ plugins, transport: { baseUrl: apiUrl } });
await prerender({
    app, origin: "https://shop.example", outDir: "dist",
    template: await readFile("dist/index.html", "utf8"),
    render: async (path) => <App router={await routerAt(path)} />,
});
```

- `template` holds `<!--kit-head-->` and `<!--kit-app-->`; each page lands at
  `<outDir><path>/index.html`.
- `head` is validated (absolute http(s) addresses, bounded text, JSON-LD as
  plain JSON) and escaped; `title` falls back to the route's.
- `state: () => dehydrate(client)` writes `<script id="kit-state">` for the
  client to hydrate from.
- A page with `robots: { index: false }` stays out of the sitemap; alternates
  become hreflang links in both.
- In the browser, `RouteGuard` applies the same head on every navigation and
  removes only the tags it wrote.

## Refuses

Every problem, at once, before anything is written: a head that fails
validation, a template without both markers, a parameter missing, empty,
`.` or `..`.
