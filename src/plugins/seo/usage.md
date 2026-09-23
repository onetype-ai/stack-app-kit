# seo

## Description

A route as HTML with its head: `render: "prerender"` at build time,
`render: "server"` per request. Other routes stay client pages.

## Purpose

A crawler and a link preview read the first HTML, not what a script draws.

## Usage

```ts
routes: [{ path: "/items/$id", component: ItemPage, title: "Item", render: "prerender",
    paths: async (ctx) => (await ctx.http.get("/items")).map(({ id }) => ({ id })),
    load: (ctx, { id }) => ctx.http.get(`/items/${id}`),
    head: (ctx, { id }) => ({ description: "…", canonical: `https://shop.example/items/${id}` }) }],

await prerender({ app, origin, outDir: "dist", template, render: (path) => …, state });
const page = await handle(request, { respond, state,
    start: (session) => start({ …, transport: { baseUrl, headers: () => session.headers } }) });
```

- `prerender` fills `<!--kit-head-->` and `<!--kit-app-->` of `template`
  into `<outDir><path>/index.html`, and writes `sitemap.xml`, `robots.txt`
  and `_shell.html`, served for every path without a file.
- `handle` starts an app per request (only the cookie and the language
  forwarded), writes the head before `</head>` of what `respond` streams,
  and answers undefined unless a server route matches a GET. Keep request
  state in the kernel.
- `head` is validated and escaped; `title` defaults to the route's.
- The browser: `hydrate(queryClient, state)` once `prerenderedState()` is
  narrowed to an object, then
  `start({ prerendered: prerenderedState() !== undefined })`, then
  `hydrateRoot` with the same tree the server rendered.
- `RouteGuard` replaces the head on navigation; pass it `params`.

## Refuses

All at once, before prerender writes: an invalid head, a template missing a
marker, a bad `fallback`, a parameter missing, empty, `.` or `..`.
