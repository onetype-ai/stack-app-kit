# Procedure: dependencies

Every dependency is carried by every application that installs us, forever.

## Between our plugins

The kernel names no plugin. A plugin reaches another only through its `api.ts`
and only what it declared in `needs`, so the graph is one line per plugin and
`tools/boundaries.mjs` refuses a cycle.

A plugin that would need the kernel to know about it is the wrong shape: the
kernel offers a registry, and what fills it is passed in.

## From outside

Runtime dependencies are close to none. `fetch`, `URL` and `AbortController`
are everywhere we run.

A validation library is the usual temptation. We take a schema *interface* the
application fills, rather than a library everyone must now install.

Types-only dependencies are `devDependencies`. Anything the application also
holds is a peer: React, and anything with identity that breaks when duplicated.

`"sideEffects": false` in every `package.json`, and it must be true.

## Refuses

- A cycle between our packages.
- A runtime dependency for something the platform does.
- A dependency that should be a peer.
- `"sideEffects": false` on a package with import-time work.
