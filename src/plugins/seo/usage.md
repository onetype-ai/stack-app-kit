# seo

## Description

Writes a route declared `render: "prerender"` as HTML at build time, with its
head, plus `sitemap.xml` and `robots.txt`. Other routes stay client pages.

## Purpose

A crawler and a link preview read the first HTML, not what a script renders.

## Usage

```ts
routes: [{
    path: "/items/$id", component: ItemPage, title: "Item", render: "prerender",
    paths: async (ctx) => (await ctx.http.get("/items")).map(({ id }) => ({ id })),
    load: (ctx, { id }) => ctx.http.get(`/items/${id}`),
    head: (ctx, { id }) => ({ description: "…", canonical: `https://shop.example/items/${id}` }),
}],

// prerender.ts, run by Node after `vite build`
await prerender({ app, origin: "https://shop.example", outDir: "dist", template,
    render: async (path) => <App router={await routerAt(path)} />,
    state: () => dehydrate(queryClient) });
```

- `template` holds `<!--kit-head-->` and `<!--kit-app-->`; a page lands at
  `<outDir><path>/index.html`, the untouched template at `_shell.html`
  (`fallback`): serve files by path, the shell for every other path.
- `head` is validated and escaped; `title` falls back to the route's.
- The browser: `hydrate(queryClient, prerenderedState())`, then
  `start({ prerendered: prerenderedState() !== undefined, … })` loads the
  router first, then `hydrateRoot` with the same tree `render` returned
  (StrictMode and providers included).
- A page with `robots: { index: false }` stays out of the sitemap.
- `RouteGuard` replaces the prerendered head on each navigation, never a tag
  it did not write; pass it the router's `params`.

## Refuses

All at once, before anything is written: an invalid head, a template
missing a marker, a bad `fallback`, a parameter missing, empty, `.` or `..`.
