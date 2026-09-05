# done

Five plugins, 155 tests.

- `src/kernel/`: boot order by `needs`, `offer`/`take`, events. A listener that
  throws reaches neither the emitter nor the others
- `kernel` plugin: `definePlugin` and `createKernel`, contract validation,
  events, hooks, slots, permissions, commands, services
- validation reports every problem in one run, naming the plugin, the key, the
  owner and the fix: not the first failure alone
- nothing partially starts: a wrong contract leaves no plugin set up
- React: `KernelProvider`, `Slot`, `RouteGuard`, `usePlugin`,
  `StatusPageProvider`. Each contribution renders behind its own boundary
- `transport`: one HTTP boundary, a socket where the server has one. Idempotent
  requests retry; `POST` and `PATCH` never retry and never move channel
- `connect` is a no-op on repeat, so two sockets never deliver one push twice
- `tools/boundaries.mjs` resolves import paths rather than matching text, which
  is what caught a relative path climbing into another plugin's `internal/`
- `wiring()` in `/testing`: every declared field has a read. It found one that did not

Every test was watched to fail before it was trusted: the kernel, the React
entry and each of the three transport traps were broken on purpose, and each
time the failure was that guarantee and no other.

## Found by running it, and by five builds on it

- **A rule nobody proved is a rule nobody has.** Two lint patterns, one test
  check and eleven stylesheets were all inert. A flat config replaces
  `no-restricted-imports` rather than merging it; a folder check asked whether
  `tests/` exists rather than what is in it; and CSS resolves an undeclared
  token to nothing, so a stylesheet against the wrong names builds green and
  moves no pixel. `styling()` in `/testing` refuses that last one now.
- **`check.sh` failed from the first day**, calling prettier and eslint with
  neither configured. Prettier cannot write Allman braces and says it never
  will, so it is gone.
- **A component could not hear an event.** `ctx.events.on` hears while a
  caller wants to and answers what stops it; `useHearing` does the same for a
  component and stops when it leaves. A build had written its own subscribers.
- **The kernel emitted an event no plugin owned.** A 401 on the session threw
  `UNDECLARED_EVENT` and took the boot with it.
- **`Held` meant four things** in one package. Now `Subscriber`,
  `Participating`, `Running`, `Api`.
- **Eight documents said things the code did not**, including an example whose
  `dependsOn` would refuse the boot it was teaching.

Five builds, five domains, 662 tests between them. Every one read the source
for the same five things, and all five are in `reference.md` now.
