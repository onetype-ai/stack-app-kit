# Changelog

## 6.5.0 (unreleased)

### Registry

- A plugin declares `registries` (`entry` schema, `key`, and optionally
  `cap`, `reserved`, `replace: "warn"`, `set: "owner"`). Plugins depending on
  it add entries with `adds` at start or `ctx.registry(name).set(entry)` at
  run time, which answers a stop. Both go through the same checks, and start
  refuses every bad entry at once (`INVALID_ENTRY`, `UNDECLARED_REGISTRY`,
  `DUPLICATE_REGISTRY`).
- `ctx.registry(name).list()`, `kernel.registry(name)` and
  `useRegistry(name)` answer the entries by `order` and then key, without
  those whose `requires` the viewer lacks.
- `remote: "<owner>.<name>"` mirrors an api kit registry: it loads
  `GET /registries/<name>`, applies each next push on `registry.<name>`,
  reads the snapshot again after a gap or `transport.reconnected`, and
  empties on `ctx.session.changed()` before the next identity reads. Only
  the server adds to it. `declarationsOf` lists
  `registries` and `adds`, and `fakeContext()` records what a plugin set.

### Pipeline

- A plugin declares `pipelines` (`input`, `output`, ordered `steps`), and
  plugins depending on it add steps with `adds`, each `before` or `after` a
  step id. Start refuses an unknown anchor, a taken id and a cycle.
- `ctx.pipeline(name).run(input)` checks the input, runs each step as
  `run(state, ctx, { stop })`, and checks the output. A failing step throws
  `PIPELINE_FAILED`, naming it. A pipeline opens no transaction.
- `kernel.explain(name)` answers the resolved order. Start logs it at debug,
  and each step logs its outcome and duration, never the state.
- `declarationsOf` lists each pipeline's steps in the order start runs them,
  with what start would refuse, and `tools/declared.mjs` prints them.
- `Context` gains `registry` and `pipeline`: a hand-built fake annotated with
  `Context` needs them (see 6.4.0). `fakeContext()` records runs in `piped`.

### Testing

- `@onetype/stack-app-kit/testing/app`: `openApp({ path, plugins, answers?,
  preset?, config?, apiBase?, staleTimeMs?, permissions?, log? })` starts the
  application at `path` with the router, a query cache and the kernel,
  against answers instead of an api. It answers `{ app, calls, client }` and
  cleans up after each test. `@tanstack/react-query`,
  `@tanstack/react-router`, `@testing-library/react` and `vitest` are
  optional peers, needed only for this entry.

## 6.4.0

The first release after 6.0.2. An application on 6.0.2 starts, and its tests
pass, unchanged. What 6.x adds as a stricter check is a warning
(`Project.findWarnings`), and becomes a refusal only with `strict: true`
(the default from 7.0). A test that annotates a hand-built fake with `Context`,
`Realtime`, `HttpClient` or `Cache` meets the new members below; annotate it
with `KernelOptions["…"]`, which still takes the old shapes, or use
`fakeContext()`.

### Transport and realtime

- `transport.wsUrl` may be a function of the headers a request carries now,
  read on every dial; `undefined` keeps the socket closed until `reconnect()`.
- `realtime.reconnect()` on the context and on `StartedApp` dials again,
  keeping every subscription. `socketFor: "push"` keeps requests on HTTP.
- `start` dials the socket once every plugin started, so its first address
  carries every plugin's `sends`; HTTP is ready before, as it was.
- Agreed with the api kit's `/ws`:
  - 4001 and 4003 wait for `reconnect()`, and 4000 redials at once after a
    socket that lived;
  - a server's `$backoff` is waited out (five minutes at most);
  - a socket silent for `silenceMs` after a `$ping` is dialled again;
  - `wake(listener)` redials at once when the device is back;
  - `subscribe(topic, receive, refused)` hears `CHANNEL_REFUSED`;
  - `onReconnected({ downMs })` and the `transport.reconnected` event fire
    once the server is `$ready` and every channel answered.
- Retries and redials spread between half and all of their backoff
  (`transport.random`).
- `ctx.http.upload` and `transport.upload`: a `Blob` as is or a `FormData` as
  multipart, with progress and abort, never retried (`transport.uploader`
  replaces `XMLHttpRequest`).
- Fixed: a request over the socket carries the headers HTTP sends, and its
  refusal the server's body; a socket opening after its timeout is closed;
  a dial while another socket was still opening closes that one, so a sign
  out leaves no socket of the previous viewer open.

### Kernel

- `cache.clear()` (cancel, drop what no view shows, reset what one shows) and
  `cache.prefetch(key, fetch)`; `cache.fromQueries` implements both.
- `ctx.session.changed()` clears the cache, has every guard ask again, then
  redials.
- The one plugin declaring `grants` may own permissions under its own name
  without `grantedBy`.
- `route.frame: false` renders a page without the application frame.
- Everything the kit throws at run time is its own class (`BootFault` with
  `INVALID_ENV`, `KernelFault`); messages are unchanged.
- `RouterOptions.createRoute` may be called with an `id` and no `path`.

### Pages for crawlers: `seo` and `server` (`./server`)

- A route may be `render: "prerender"` or `render: "server"`, with `paths`,
  `load` and a validated, escaped `head` (canonical, robots, Open Graph,
  Twitter, JSON-LD, hreflang); `RouteGuard` applies it in the browser.
- `prerender()` writes each page, `sitemap.xml`, `robots.txt`, `_shell.html`
  (served for every path without a page) and `_template.html` (the markers
  kept, for a server).
- `prerenderOnBuild({ entry, origin })` runs `prerenderApp({ start, tree,
  state })` after the client build, and makes `vite preview` serve like the
  host.
- `handle(request, { start, respond })` renders a server route with an app
  per request (only the viewer's cookie and language); `respondWith` renders
  into `_template.html`.
- `router.history` and `StartedApp.visit(path)`; `start({ prerendered })`
  loads the router as the server did; `prerenderedState()` and
  `prerenderedLocale()` read back what a rendered page recorded.

### Locale

- `locale.negotiate(accepted, supported, fallback, chosen?)`, sharing its case
  table with the api kit.
- A plugin's `messages` (refused at start when the fallback lacks a key),
  `ctx.locale` (`text` with holes and plural forms, `format`, `change`,
  `watch`), `start({ locale })`, `useLocale` and `useLocaleAfterHydration`;
  `KernelProvider` keeps `<html lang>` current.

### Settings, logs, React, testing, tooling

- `start({ environment })` maps `VITE_<PLUGIN>__<FIELD>` onto config;
  `settings.refusingSecrets()` stops a build shipping a secret-looking
  variable.
- `logs.create`, `logs.shipper` (batched, clipped, redacted), `postTo`,
  `captureErrors`.
- `./react`: `AppBoundary` and `StreamedText`; focus returns when a trap closes.
- `./testing`: `configureTestKernels`, `withDependencies`,
  `resetTestKernels`; `fakeContext()` counts reconnects, clears and prefetches.
- `Project.findWarnings()`: a plugin's `usage.md` past 1800 characters (a
  refusal in `findAll` with `strict: true`).
- `./e2e` (Playwright is an optional peer): `Stack`, `Browsers` with a
  machine-wide lock, `Hosts` over a per-run certificate.
- `npx stack-app-kit-schemas [--check]` writes an application's `schemas.md`.
- Every plugin's `usage.md` ships in the package.
