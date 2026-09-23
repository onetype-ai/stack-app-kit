# Changelog

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
