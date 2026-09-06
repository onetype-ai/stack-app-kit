# done

Five plugins, 155 tests, each watched to fail before it was trusted.

- `src/kernel/`: boot order by `needs`, `offer`/`take`, events
- `kernel` plugin: `definePlugin`, `createKernel`, contract validation, events,
  hooks, slots, permissions, commands, services
- validation reports every problem in one run, naming plugin, key, owner, fix
- nothing partially starts: a wrong contract leaves no plugin set up
- React: `KernelProvider`, `Slot`, `RouteGuard`, `usePlugin`,
  `StatusPageProvider`
- `transport`: HTTP, plus a socket where the server has one. Idempotent
  requests retry; `POST` and `PATCH` never retry and never move channel
- `connect` is a no-op on repeat, so two sockets never deliver one push twice
- `tools/boundaries.mjs` resolves import paths rather than matching text
- `findUnusedFields()` found a declared field nothing read

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

Five builds, five domains, 662 tests. Every one read the source for the same
five things, all now in `reference.md`.
