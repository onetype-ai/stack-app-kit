# Reference

## Context

What every service, listener, participant and command is handed.

```ts
type Context<Config = unknown, Services = unknown> = {
    name: string; config: Config; services: Services;
    log: Logger; http: HttpClient; cache: Cache; realtime: Realtime;
    events: {
        emit: (event: string, payload: unknown) => void;
        on: (event: string, handle: (payload: unknown) => void) => () => void;
    };
    hooks: { run: (hook: string, payload: unknown) => Promise<string | undefined> };
    permissions: { has; all; changed: () => void; watch: (notify) => () => void };
    commands: { run: (command: string, input: unknown) => Promise<void> };
    use: <Api>(plugin: string) => Api;
};
```

```ts
type HttpClient = { get; post; put; patch; delete: (path: string, request?: CallOptions) => Promise<unknown> };
type Cache = { invalidate: (key: readonly unknown[]) => void };
type Realtime = {
    channel: () => "ws" | "http";
    subscribe: (channel: string, receive: (message: unknown) => void) => { close: () => void };
};
```

These three arrive without being declared. With no socket, `channel()` answers
`"http"` and `subscribe` delivers nothing, so a caller needs no branch.

**`http` answers the body, never an envelope.** A 204 is `undefined`, anything
but a 2xx throws. A fake answering `{ status, body }` describes the channel
underneath, and tests itself rather than the code.

`hooks.run` answers the first refusal, or nothing. `use` reaches another
plugin's services outside a component.

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
routes?: readonly Route[];   // path, component, title, requires?, search?, instead?
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
slot(name, payload): { contributions: readonly PlacedContribution[]; problem?: string }
context(plugin): Context        pages(): Pages
sent(): Record<string, string>  // what `sends` adds to every request
```

## Imports

```ts
import { createKernel, definePlugin, boot, Host, KernelFault } from "@onetype/stack-app-kit";
import { KernelProvider, useKernel, usePlugin, useEvent, useStore, NotFound, useFrame } from "@onetype/stack-app-kit/react";
import { transport, cache } from "@onetype/stack-app-kit";

// The namespace carries its own types: `transport.Socket` is what
// `openSocket` must answer.
```

```ts
<Slot name="board.aside" payload={{ id }} />        // parses against the slot's schema
<RouteGuard route={registered} send={goTo} />       // one route, guarded
useKernel(): Kernel
usePlugin<Config, Services>(name): Context          // the context itself, not a wrapper
useFrame(): FunctionComponent
useEvent(plugin, event, handle): void               // stops when the component leaves
useStore(watch, read): Value                         // a value a service keeps
```

`kernel.permissions.changed()` says the answer moved, so every guard asks
again: a viewer who signs in stops seeing the page that refused them.

`Route.instead(ctx)` answers a path when the viewer belongs elsewhere: a
checkout with an empty cart is early, not forbidden. `send` does the going,
since the kit imports no router. `RouteGuard` asks it **before** `requires`:
a signed-out reader is sent to sign in, not told the page is not theirs.

Memoise what `useStore`'s `read` answers, or it never stops re-rendering.

A contribution renders as `ComponentType<{ payload: unknown }>`. `Slot` filters
by `requires` and wraps each in its plugin's `fallback`.

**A contribution needs no `dependsOn` on the plugin whose slot it fills.** It
hands over a component and takes back a payload the kernel parses, so it
reaches for nothing. A `listens` or `participates` does: both read a shape
whose owner may change it, and name that owner. Without the difference a shell
could never frame the plugins filling it, which is what a slot is for.

`/react` also answers `StartupFailure`, `StatusPageProvider`, `useDismiss`,
`useEventCallback` and `useFocusTrap`. `NotFound` is not optional: routes
assembled without it throw.

## Faults

`Fault` while booting, `KernelFault` from a contract, `TransportFault` from a
request. Each carries a `code` and sets `name`.

```ts
TransportFault: { code; status?; method; path; retryable; body }
```

`body` is what the server sent with its refusal, unread: a form finds its
field errors there.

A 401 is also announced as `transport.unauthorized` carrying `{ path }`. The
mount owns it, so a plugin that listens names `transport` in `dependsOn`.

## Testing

```ts
import { Project } from "@onetype/stack-app-kit/testing";

expect(Project.findAll()).toEqual([]);
```

One call runs every check, so one the kit adds later needs no new test here.
Each answers `{ check, message }`. Two plugins each holding one util or one
enum is refused; a copy that cannot import names itself in `sharing`.
`budgets: { "public/x.js": 2048 }`
weighs a built file gzipped.
Each `find*` is exported too.
`across: ["../api/src/plugins"]` names the other half of a two-stack
application; a guard that cannot reach it is `skipped`, never a pass.
