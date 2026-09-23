# Reference

## Context

What every service, listener, participant and command is handed.

`schema.md` carries every field, generated from the code. What it cannot say:

`http`, `cache` and `realtime` arrive without being declared. With no socket, `channel()` answers
`"http"` so a caller can branch, and `subscribe` refuses rather than handing
back a subscription that would deliver nothing.

**`session.changed()`** after a sign-in, sign-out or workspace switch clears
the cache, has every guard ask again, then redials. Pushes missed while the
socket was down are lost: listen to `transport.reconnected` and fetch again.

**`http` answers the body, never an envelope.** A 204 is `undefined`, anything
but a 2xx throws; a fake answering `{ status, body }` tests itself.

`hooks.run` answers the first refusal, or nothing. `use` reaches another
plugin's services.

`events.on` hears while a caller wants to and answers what stops it; a
contract's `listens` never stops. Neither hears its own plugin's events.

A plugin aliases its shape once: `type Inside = Context<Config, Services>`.

## Definition

What `definePlugin(name, { … })` takes. Every key is optional but `version`.

```ts
version: string; describe: string; dependsOn?: readonly string[];
config?: ZodType; permissions?: Record<string, { describe: string }>;
grants?: (ctx) => readonly string[];          // at most one plugin
services?: (ctx) => Services;                 // ctx.services is never here
frame?: FunctionComponent; pages?: Pages; fallback?: ComponentType;
routes?: readonly Route[];   // path, component, title, requires?, search?, instead?,
                             // render?, paths?, load?, head? (seo/usage.md)
slots?: Record<string, Slot>; contributes?: readonly SlotContribution[];
emits?: Record<string, Event>; listens?: Record<string, Listener>;
hooks?: Record<string, Hook>; participates?: Record<string, Participant>;
commands?: Record<string, Command>;
sends?: (ctx) => Record<string, string>;      // headers, one owner each
setup?: (ctx) => void | Promise<void>; teardown?: (ctx) => void | Promise<void>;
```

Rules: the application's `contract.md`.

## What a start refuses

A refusal names its code, the plugin and the fix, one line per problem.

A plugin name is lowercase letters, digits and hyphens, starting with a
letter. Everything it declares is `plugin.thing`: an event, hook, slot or
command not starting with its own name is refused.

## Kernel

```ts
start(): Promise<void>          stop(): Promise<void>       started(): boolean
routes(): readonly RegisteredRoute[] frame(): FunctionComponent | undefined
slot(name, payload): { contributions: readonly MountedContribution[]; problem?: string }
context(plugin): Context        pages(): Pages
plugins(): readonly Plugin[]    // what started, for declarationsOf
sent(): Record<string, string>  // what `sends` adds to every request
```

## What a plugin declares

```ts
declarationsOf(plugins): Declaration[]    // pure, before start
declarationsOf(plugins, "dashboard")      // one, or [] if absent
declarationsOf(kernel.plugins())          // what actually started
```

A `Declaration` names every surface with its sentence, and flags the parts
that are components rather than data. Schemas are left out. From a terminal:
`node tools/declared.mjs ./src/kernel/plugins.js [name] [--json]`

## Imports

```ts
import { createKernel, definePlugin, boot, Host, KernelFault } from "@onetype/stack-app-kit";
import { KernelProvider, useKernel, usePlugin, useEvent, useStore, NotFound, useFrame } from "@onetype/stack-app-kit/react";
import { transport, cache } from "@onetype/stack-app-kit";

// The namespace carries its own types: `transport.Socket` is what
// `openSocket` must answer.
```

```ts
<Slot name="board.aside" payload={{ id }} />        // parsed by its schema; none is {}
<RouteGuard route={registered} send={goTo} />       // one route, guarded
useKernel(): Kernel
usePlugin<Config, Services>(name): Context          // the context itself, not a wrapper
useFrame(): FunctionComponent
useEvent(listener, event, handle): void             // listener is the plugin hearing, not the owner
useStore(watch, read): Value                         // a value a service keeps
```

`kernel.permissions.changed()` has every guard ask again.

`Route.instead(ctx)` answers a path when the viewer belongs elsewhere (an
empty cart's checkout); `send` does the going. `RouteGuard` asks it
**before** `requires`, so a signed-out reader is sent to sign in.

Memoise what `useStore`'s `read` answers, or it never stops re-rendering.

A contribution renders as `ComponentType<{ payload: unknown }>`. `Slot` filters
by `requires` and wraps each in its plugin's `fallback`.

**A contribution names the slot's owner in `dependsOn`**, as a `listens` or
`participates` does: the payload it takes is a shape that owner may change.
Without it, start refuses `UNDECLARED_DEPENDENCY`.

`/react` also answers `StartupFailure`, `StatusPageProvider`, `useDismiss`,
`useEventCallback`, `useFocusTrap` (focus returns on close), and:

```tsx
<AppBoundary onError={(error) => log.error("render failed", { error })}>…</AppBoundary>
<StreamedText text={reply} streaming={isStreaming} label="Assistant" />
```

`AppBoundary` shows a retry page, never nothing. `StreamedText` is busy while
it grows, announced once complete. `NotFound` is required.

## Faults

`BootFault` while booting, `KernelFault` from a contract, `TransportFault` from a
request. Each carries a `code` and sets `name`.

```ts
TransportFault: { code; status?; method; path; retryable; body }
```

`body` is the server's refusal, unread: a form finds its field errors there.
A 401 is also announced as `transport.unauthorized` (`{ path }`); a listener
names `transport` in `dependsOn`.

## Testing

```ts
import { Project } from "@onetype/stack-app-kit/testing";

expect(Project.findAll()).toEqual([]);
```

One call runs every check, including ones the kit adds later; each answers
`{ check, message }`, and each `find*` is exported too. Two plugins holding
one util or enum is refused (a copy names itself in `sharing`).
`budgets: { "public/x.js": 2048 }` weighs a built file gzipped.
`otherStacks: ["../api/src/plugins"]` names the other half of a two-stack
application; a guard that cannot reach it is `skipped`, never a pass.

`configureTestKernels({ resolve })` in a setup file lets a test name only the
plugin under test: `start` adds its dependencies, transitively, from
`resolve(name)` → `{ plugin, config? }`; a passed plugin wins by name.
`withDependencies` does it for `createKernel`.
