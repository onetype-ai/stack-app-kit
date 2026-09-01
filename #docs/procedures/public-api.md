# Procedure: public API

What a plugin exposes, and what it never does.

## The rule

`src/plugins/<name>/api.ts` is the only file another plugin may import.
Everything else lives in that plugin's `internal/`.

TypeScript will not stop a deep import the way Go stops one, so two things
enforce it: `exports` lists only the package entries, and
`tools/boundaries.mjs` refuses a reach into another plugin's `internal/`. No
wildcard in `exports`, ever.

## api.ts holds

The interfaces the plugin satisfies, the types crossing the boundary, the
error classes callers match on, and one factory or accessor.

```ts
export type { Transport, Request } from "./internal/contract";
export { TransportError } from "./internal/errors";
export function from(host: Host): Transport
```

No logic, no state, no work at import time.

## Calling another plugin

Declare it in `needs`, then take it in `boot`: `const held =
transport.from(host)`. Take once, at boot, and hold it. Never on a hot path.

## Factories, not classes

`createTransport(options)`, not `new Transport(options)`. The factory returns
an interface, so a caller holds the contract, not the implementation.

Dependencies are arguments: never a global, never a singleton. `openSocket` is
a parameter, so the plugin runs where there is no socket and a test passes its
own.

## Types

A public type is owned by the plugin defining it. Never expose an internal
one: if a caller cannot construct it, it is not on the boundary.

`api.ts` and `usage.md` change in the same commit, or the contract is a lie.

## Refuses

- Logic, state or import-time work in `api.ts`.
- A public function returning an internal type.
- Importing another plugin's `internal/`.
- Calling a plugin absent from `needs`.
