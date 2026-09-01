# done

Both plugins, 87 tests, ~3k lines.

- `src/kernel/`: boot order by `needs`, `offer`/`take`, events. A listener that
  throws reaches neither the emitter nor the others
- `kernel` plugin: `definePlugin` and `createKernel`, contract validation,
  events, hooks, slots, permissions, commands, services
- validation reports every problem in one run, naming the plugin, the key, the
  owner and the fix — not the first failure alone
- nothing partially starts: a wrong contract leaves no plugin set up
- React: `KernelProvider`, `Slot`, `RouteGuard`, `usePlugin`,
  `StatusPageProvider`. Each contribution renders behind its own boundary
- `transport`: one HTTP boundary, a socket where the server has one. Idempotent
  requests retry; `POST` and `PATCH` never retry and never move channel
- `connect` is a no-op on repeat, so two sockets never deliver one push twice
- `tools/boundaries.mjs` resolves import paths rather than matching text, which
  is what caught a relative path climbing into another plugin's `internal/`
- `tools/wiring.mjs`: every declared field has a read. It found one that did not

Every test was watched to fail before it was trusted: the kernel, the React
entry and each of the three transport traps were broken on purpose, and each
time the failure was that guarantee and no other.

Nothing here has run outside a test runner.
