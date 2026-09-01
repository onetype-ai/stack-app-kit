# Procedure: dependencies

Every dependency is carried by every application that installs us, forever.
The cheapest one is the one not taken.

## Between our plugins

The kernel names no plugin. A plugin reaches another only through its `api.ts`
and only what it declared in `needs`, so the graph is visible in one line per
plugin and `tools/boundaries.mjs` refuses a cycle.

A plugin that would need the kernel to know about it is the wrong shape: the
kernel offers a registry, and what fills it is passed in.

## From outside

Runtime dependencies are close to none. A front-end library is measured by
what it adds to a bundle, and ours is in every application that takes us.

Before adding one: does the platform already do it? `fetch`, `URL`,
`AbortController` are everywhere we run. Is it smaller to write the part we
use? Would we still take it at ten times the size?

A validation library is the usual temptation. We take a schema *interface* the
application fills, rather than a library everyone must now install.

Types-only dependencies are `devDependencies`. Anything the application also
holds is a peer: React, and anything with identity that breaks when
duplicated.

## Side effects

`"sideEffects": false` in every `package.json`, and it must be true: a module
doing work on import cannot be dropped by a bundler, so an application taking
one entry pays for all of them.

## Refuses

- A cycle between our packages.
- A runtime dependency for something the platform does.
- A dependency that should be a peer.
- `"sideEffects": false` on a package with import-time work.
