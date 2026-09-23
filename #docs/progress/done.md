# done

Eleven plugins, 608 tests, each watched to fail before it was trusted.

- `src/kernel/`: boot order by `needs`, `offer`/`take`, events
- `kernel` plugin: `definePlugin`, `createKernel`, contract validation, events,
  hooks, slots, permissions, commands, services
- validation reports every problem in one run, naming plugin, key, owner, fix
- `sends`: a plugin adds headers to every request, one owner per header, and a
  second author is refused however the name is spelled
- a contribution reads what the slot's schema answered, so a default or a
  transform the opener declared reaches it
- `useStore` refuses a `read` that answers something new each call, rather than
  leaving React to loop until it throws about its own internals
- every optional key in the contract takes `undefined`, so a caller building a
  route from values it may not have is not asked to change a type it cannot
- nothing partially starts: a wrong contract leaves no plugin set up
- React: `KernelProvider`, `Slot`, `RouteGuard`, `usePlugin`,
  `StatusPageProvider`
- `transport`: HTTP, plus a socket where the server has one. Idempotent
  requests retry; `POST` and `PATCH` never retry and never move channel
- `connect` is a no-op on repeat, so two sockets never deliver one push twice
- `tools/boundaries.mjs` resolves import paths rather than matching text
- `findUnusedFields()` found a declared field nothing read
- `fakeContext()` in `/testing`: one fake, answering as the transport does
- `findPrivateComments()` refuses a comment that never reaches `dist`

## seo: pages a crawler can read

A route may be `render: "prerender"`, with `paths`, `load` and `head`; start
refuses a guarded one. `./server` writes each page from the built template
with its validated, escaped head, then `sitemap.xml` and `robots.txt`;
`RouteGuard` applies the same head in the browser.

## logs: what a browser logged, sent home

A leveled logger for `start({ log })` and a shipper: 20 entries or 30 kB a
request, the rest on the next tick (the project's version dropped them),
redacted keys and token-shaped values, a minute's pause after a 429.

## settings: config from the environment

`start({ environment })` maps `VITE_<PLUGIN>__<FIELD>` onto config and refuses
every problem at once; `refusingSecrets` stops a build shipping a variable
that reads like a secret.

## 6.2.0: a socket that knows its state

Agreed with the api kit's `/ws`: 4003 waits for `reconnect()`, `$backoff` is
waited out, a server that pings is timed for silence, `wake` redials at once,
a declined channel calls `refused`, and `transport.reconnected` fires once the
server is `$ready` and every channel answered. `session.changed()` clears,
regrants and redials, in that order.

## 6.1.0: taken back from the first project on the kit

Each was a patch the project carried against 6.0.2, and each mutation of it
was watched to fail here.

- the socket address follows the viewer, redials with jitter, waits after
  4001 and closes a socket that opened too late; a socket request carries the
  headers HTTP sends, and a refusal its body
- `cache.clear()` resets what a view shows, since a plain clear left it on
  the previous workspace's data
- the single granter needs no nomination
- a test names only the plugin under test (`configureTestKernels`)
- a plugin's `usage.md` is measured

## Taken from the project that was writing it itself

Every one moved with its tests, and each was broken in its new home before it
was trusted.

- **The router is built by `start`.** `StartedApp.router` is the tree, made
  from what plugins declared. An application hands over its library, its 404,
  its outlet and its guard; the shell comes from whichever plugin declared
  `frame`, so nothing names which plugin holds it. `routes.tsx` and its tests
  left the project, and `mount.tsx` is 31 lines.
- **The root redirects where no plugin claims `/`.** The first route there is
  answers it. A plugin that does declare `/` keeps it, with nothing added in
  front.
- **`Env.rules`.** The same refusals as the api kit's, over a value read
  elsewhere: a bundler replaces `import.meta.env` where it is written, so
  reading belongs to the application and only the rules belong here.
- **`serving`.** A port of its own, refused when taken, and `/api` reaching
  the back. `strictPort` is the point: two people running their own never
  share one by accident.
- **`findEntryReach` and the contract-key check**, both in `Project`. A
  composition root importing through `@plugins/` stops being a root; a key a
  contract accepts that no document writes is one an author never learns
  exists.

## Found while taking it

- **A frame never rendered its page.** The router hands the matched page to an
  outlet rather than passing children, and nothing here said so, so every
  frame was a shell around nothing. Found in a browser, not by a test: the
  shell was in the DOM and empty. `outlet` is part of the contract now.
- **The first test for that was worthless.** It asserted the frame was the
  component a plugin declared, which stayed true with the outlet removed.
  Broken on purpose, it passed. It renders the frame now and reads what is
  inside it; broken on purpose, it fails.

## Read back against a project, and ten things fell out

- **Nothing said what `ctx.http` answers.** Reading the source answered it
  wrongly twice on a real build: the channel returns an envelope and the
  transport unwraps it, so thirty-nine calls were written against a shape that
  never arrives, behind two hundred green tests. A test now boots the real
  kernel over a fake `fetch` and asks, rather than reading.
- **Every plugin wrote its own fake, and they drifted.** One answered an
  envelope, another resolved where the transport refuses. `fakeContext` ships
  one, and its own tests compare it against the real transport.
- **`RouteGuard` asked about permissions before `instead`,** so a signed-out
  reader was told a page was not theirs rather than sent to sign in.
- **Names that were verbs.** `told` meant three things, `seen` twenty-five.
  Fixed in one pass with a scanner that reads code and not prose.

## Found by running it, and by five builds on it

- **A rule nobody proved is a rule nobody has.** Two lint patterns, one test
  check and eleven stylesheets were inert. A flat config replaces
  `no-restricted-imports` rather than merging it; a folder check asked whether
  `tests/` exists rather than what is in it; CSS resolves an undeclared token
  to nothing, so a wrong-named stylesheet builds green. `findUnknownTokens()` refuses
  that last one now.
- **`check.sh` called prettier and eslint with neither configured.** Prettier
  cannot write Allman braces, so it is gone.
- **A guard could only ask about permissions**, so a page that was early
  rather than forbidden rendered, noticed, and redirected: the viewer saw the
  wrong screen first. `Route.instead` answers where they belong.
- **A route declared no query parameters.** `Route.search` takes a schema now,
  and a route naming none takes nothing.
- **`useStore(watch, read)`** replaced the subscribe-and-read three builds wrote
  by hand; it subscribes once however often a caller passes a new closure.
- **`useEvent`** lets a component hear an event and stops when it leaves.
- **The kernel emitted an event no plugin owned.** A 401 on the session threw
  `UNDECLARED_EVENT` and took the boot with it.
- **`Held` meant four things.** Now `Subscriber`, `Participating`, `Running`,
  `Api`.
- **Eight documents said things the code did not**, including an example whose
  `dependsOn` would refuse the boot it was teaching.

Five builds, five domains, 336 tests. Every one read the source for the same
five things, all now in `reference.md`.
