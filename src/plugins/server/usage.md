# server

## Description

Renders pages in Node from `./server`: routes declared `render: "prerender"`
at build time, and `render: "server"` per request.

## Purpose

The first HTML carries the page and its head, for crawlers and first paint.

## Usage

```ts
// vite.config.ts
plugins: [prerenderOnBuild({ entry: "src/prerender.tsx", origin: SITE_ORIGIN })],

// src/prerender.tsx: one query client for start's cache and for state
export default prerenderApp({ start, tree: (app) => <Tree app={app} />, state: () => dehydrate(client) });

// a Node server
const page = await handle(request, { respond: respondWith({ template, tree }), state,
    start: (session) => start({ …, transport: { baseUrl, headers: () => session.headers } }) });
```

- A prerender fills `<!--kit-head-->` and `<!--kit-app-->` into
  `<outDir><path>/index.html`, writes `sitemap.xml`, `robots.txt`,
  `_shell.html` (served for paths without a file) and `_template.html`
  (markers kept: the template `respondWith` reads).
- `prerenderOnBuild` builds the entry after the client, runs it, and skips
  its own server build; the router needs `history: (path) => memory`.
- `handle` starts an app per request (only the cookie and the language
  forwarded), stands its router at the path, writes the head before
  `</head>`, and answers undefined unless a server route matches a GET.
  Keep request state in the kernel; a `load` fills the cache that `state`
  carries with `ctx.cache.prefetch(key, fetch)`.
- The browser: `hydrate(client, state)` once `prerenderedState()` is
  narrowed, `start({ prerendered: true })`, then `hydrateRoot`.

## Refuses

Before writing: a bad head, a template missing a marker, a bad `fallback`,
a parameter missing, empty, `.` or `..`; in production, no absolute origin.
