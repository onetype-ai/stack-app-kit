# Changelog

## 6.4.0 (unreleased)

### Added

- `route.frame: false` renders a page without the application frame (a
  landing, sign-in or legal page); a prerendered route defaults to it.
- `ctx.http.upload(path, body, { onProgress, signal, method })` and
  `transport.upload`: a `Blob` as is or a `FormData` as multipart, with
  progress and abort, never retried; `transport.uploader` replaces
  `XMLHttpRequest`. A client given to `createKernel` without `upload` is
  accepted, and `ctx.http.upload` then refuses.
- The package ships every plugin's `usage.md`, for an agent reading
  `node_modules`.

### Changed

- `RouterOptions.createRoute` may be called with an `id` and no `path`, for
  the layout route holding the frame. A router adapter written for 6.3
  types its `path` as optional.

## 6.3.0

### Added

- `render: "server"` and `./server` `handle(request, { start, respond })`:
  an app per request (the viewer's cookie and language only), the route's
  checked head written into the streamed document, undefined for requests
  it does not render.
- `prerenderOnBuild({ entry, origin })`, a Vite plugin that builds and runs
  the prerender entry after the client build (and skips its own server
  build), and `prerenderApp({ start, tree, state })` as that entry's default
  export.
- `router.history` and `StartedApp.visit(path)`, which stand the router at a
  path and load it; `handle` visits the requested path before `respond`.
- `respondWith({ template, tree })`, a `respond` rendering into the template
  a prerender keeps as `_template.html`; a template without both markers is
  refused when it is made.
- `ctx.cache.prefetch(key, fetch)` (`cache.fromQueries` implements it), so a
  route's `load` fills what its page and the dehydrated state read.
- A `server` plugin now owns rendering in Node; `seo` keeps the head, the
  sitemap and robots.txt. `./server` and `SeoFault` are unchanged.

### Changed

- Tests run in worker threads.

### Fixed

- `reference.md`: a `Slot` given no payload parses `{}`.

## 6.2.0

Additive, except `settings.refusingSecrets`, which is new here.

### Added

- Realtime, agreed with the api kit's `/ws`:
  - a close 4003 waits for `reconnect()`;
  - a server's `$backoff` is waited out, capped at five minutes;
  - once a server sent `$ping`, a socket silent for `silenceMs` (60 s) is
    dialled again;
  - `wake(listener)` redials at once when the device is back;
  - `subscribe(topic, receive, refused)` hears `CHANNEL_REFUSED`;
  - `onReconnected({ downMs })` and the `transport.reconnected` event fire
    once the server is `$ready` and every channel answered.
- `ctx.session.changed()`: clears the cache, has every guard ask again, then
  redials, in that order.
- `settings`: `start({ environment })` maps `VITE_<PLUGIN>__<FIELD>` onto
  config and refuses every problem at once. `settings.refusingSecrets()` is a
  Vite plugin that stops a build shipping a variable that reads like a
  secret.
- `logs`:
  - `logs.create` gives `start({ log })` a leveled logger;
  - `logs.shipper` batches, clips, redacts and sends a browser's logs;
  - `postTo(url)` sends them, and `captureErrors` logs what nothing caught.
- `seo` and `./server`:
  - a route may be `render: "prerender"`, with `paths`, `load` and a
    validated `head` (canonical, robots, Open Graph, Twitter, JSON-LD,
    hreflang);
  - `prerender()` writes each page, `sitemap.xml`, `robots.txt` and the
    untouched template as `_shell.html`, served for every path without a
    page of its own;
  - `start({ prerendered: true })` loads the router as the server rendered
    it before answering, so `hydrateRoot` matches;
  - `RouteGuard` applies the head in the browser (pass `params`), replacing
    what the prerender wrote;
  - `prerenderedState()` from `./react` reads back the cache state a
    prerender wrote, for `hydrate` before `hydrateRoot`.
- `npx stack-app-kit-schemas [--check]` writes, or checks, an
  application's `schemas.md` from the installed kit.

### Fixed

- `schema.md` lost a plugin's namespace when tsup moved it into a shared
  chunk.

## 6.1.0

Everything here is additive; an application on 6.0.2 starts unchanged.

### Added

- `transport.wsUrl` may be a function of the headers a request carries now,
  read on every dial; `undefined` keeps the socket closed until `reconnect()`.
- `realtime.reconnect()` on the context and on `StartedApp`: dials again with
  the address as it reads now, keeping every subscription.
- `socketFor: "push"` keeps every request on HTTP and the socket for pushes.
- `transport.random` spreads retries and redials between half and all of
  their backoff.
- `cache.clear()`: cancels what is loading, drops what no view shows, resets
  what a view shows. `cache.fromQueries` implements it; a cache without
  `clear` is still accepted, and `ctx.cache.clear()` then refuses.
- `./testing`: `configureTestKernels({ resolve })`, `withDependencies`,
  `resetTestKernels`, so a test names only the plugin under test.
- `fakeContext().reconnected` and `.cleared`.

### Changed

- `start` dials the socket once every plugin started, so its first address
  carries every plugin's `sends`. HTTP is ready before, as it was.
- A close 4001 waits for `reconnect()`; 4000 after a socket that lived
  redials at once; a socket opening after its connect timeout is closed.
- The one plugin declaring `grants` may own permissions under its own name
  without being named in `grantedBy`.
- `Project.findAll` measures each plugin's `usage.md` against 1800
  characters.

### Fixed

- A request sent over the socket now carries the same headers as HTTP.
- A refusal over the socket now carries the server's body.
- HTTP retries no longer return in lockstep.
- `reference.md` said a slot contribution needs no `dependsOn` on the slot's
  owner; start refuses that, and the document now says so.
