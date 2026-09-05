# Reference

## Context

What every service, listener, participant and command is handed.

```ts
type Context<Config = unknown, Services = unknown> = {
    name: string; config: Config; services: Services;
    log: Logger; http: Client; cache: Cache; realtime: Realtime;
    events: {
        emit: (event: string, payload: unknown) => void;
        on: (event: string, told: (payload: unknown) => void) => () => void;
    };
    hooks: { run: (hook: string, payload: unknown) => Promise<string | undefined> };
    permissions: { has: (one: string) => boolean; all: (many: readonly string[]) => boolean };
    commands: { run: (command: string, input: unknown) => Promise<void> };
    use: <Api>(plugin: string) => Api;
};
```

```ts
type Client = { get; post; put; patch; delete: (path: string, request?: Request) => Promise<unknown> };
type Cache = { invalidate: (key: readonly unknown[]) => void };
type Realtime = {
    channel: () => "ws" | "http";
    subscribe: (channel: string, told: (message: unknown) => void) => { close: () => void };
};
```

These three arrive without being declared. With no socket, `channel()` answers
`"http"` and `subscribe` delivers nothing, so a caller needs no branch. With
no client at all, `http` and `cache` throw naming what to pass.

`hooks.run` answers the first refusal, or nothing. `use` reaches another
plugin's services outside a component, so a plain function can call it.

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
routes?: readonly Route[];   // path, component, title?, requires?, search?
slots?: Record<string, Slot>; contributes?: readonly Contribution[];
emits?: Record<string, Event>; listens?: Record<string, Listener>;
hooks?: Record<string, Hook>; participates?: Record<string, Participant>;
commands?: Record<string, Command>;
setup?: (ctx) => void | Promise<void>; teardown?: (ctx) => void | Promise<void>;
```

Rules: the application's `contract.md`.

## What a start refuses

`INVALID_NAME`, `DUPLICATE_PLUGIN`, `UNKNOWN_DEPENDENCY`,
`UNDECLARED_DEPENDENCY`, `DEPENDENCY_CYCLE`, `DUPLICATE_ROUTE`,
`INVALID_ROUTE`, `INVALID_CONFIG`. Every one names the plugin and the key.

A plugin name is lowercase letters, digits and hyphens, starting with a
letter. Everything it declares is `plugin.thing`: an event, hook, slot or
command not starting with its own name is refused.

## Kernel

```ts
start(): Promise<void>          stop(): Promise<void>       started(): boolean
routes(): readonly Registered[] frame(): FunctionComponent | undefined
slot(name, payload): { contributions: readonly Filled[]; wrong?: string }
context(plugin): Context        pages(): Pages
```

`Registered` is a route plus the plugin that declared it and its `fallback`.

## Imports

```ts
import { createKernel, definePlugin, boot, Host, KernelFault } from "@onetype/stack-app-kit";
import { KernelProvider, useKernel, usePlugin, useHearing, useKept, NotFound, useFrame } from "@onetype/stack-app-kit/react";
import { transport, cache } from "@onetype/stack-app-kit";

// The namespace carries its own types: `transport.Socket` is what
// `openSocket` must answer, and what a fake source implements.
const held: transport.Socket = openFake();
```

```ts
<Slot name="board.aside" payload={{ id }} />   // payload parses against the slot's schema
<RouteGuard route={registered} />              // what a router renders for one route
useKernel(): Kernel
usePlugin<Config, Services>(name): Context<Config, Services>
useFrame(): FunctionComponent
```

`usePlugin` answers that plugin's `Context` itself, not a wrapper.
`useHearing(plugin, event, told)` stops when the component leaves.

`useKept(watch, read)` reads a value a service keeps and re-renders when it
moves. Memoise what `read` answers, or it re-renders forever.

A contribution renders as `ComponentType<{ payload: unknown }>`. `Slot` filters
by `requires` and wraps each in the contributing plugin's `fallback`.

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
import { boundaries, wiring, styling, missing, oversized, undocumented } from "@onetype/stack-app-kit/testing";
```

Each takes a path and answers what is wrong, so a test asserts an empty array.
`wiring` finds a declared field nothing reads, `styling` a `var()` naming a
token nothing declares, `boundaries` an import that
crossed one, and the last three what a document promised and does not hold.
