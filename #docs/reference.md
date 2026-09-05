# Reference

## Context

What every service, listener, participant and command is handed.

```ts
type Context<Config = unknown, Services = unknown> = {
    name: string; config: Config; services: Services;
    log: Logger; http: Client; cache: Cache; realtime: Realtime;
    events: { emit: (event: string, payload: unknown) => void };
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

These three arrive without being declared: they are the kit's own plugins, and
naming one in `dependsOn` fails startup.

With no socket, `channel()` answers `"http"` and `subscribe` delivers nothing,
so a caller needs no branch. With no client at all, `http` and `cache` throw
naming what to pass.

`hooks.run` answers the first refusal, or nothing. `use` reaches another
plugin's services outside a component, so a plain function can call it.

A plugin aliases its own shape once: `type Inside = Context<Config, Services>`.

## Definition

What `definePlugin(name, { … })` takes. Every key is optional but `version`.

```ts
version: string; describe: string; dependsOn?: readonly string[];
config?: ZodType; permissions?: Record<string, { describe: string }>;
grants?: (ctx) => readonly string[];          // at most one plugin
services?: (ctx) => Services;                 // ctx.services is never here
frame?: FunctionComponent; pages?: Pages; fallback?: ComponentType;
routes?: readonly Route[];
slots?: Record<string, Slot>; contributes?: readonly Contribution[];
emits?: Record<string, Event>; listens?: Record<string, Listener>;
hooks?: Record<string, Hook>; participates?: Record<string, Participant>;
commands?: Record<string, Command>;
setup?: (ctx) => void | Promise<void>; teardown?: (ctx) => void | Promise<void>;
```

The rules for these keys are in the application's `contract.md`.

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
import { KernelProvider, useKernel, usePlugin, NotFound, useFrame } from "@onetype/stack-app-kit/react";
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

`usePlugin` answers that plugin's `Context` itself, not a wrapper:
destructure `{ services, config }` from it, never `{ ctx }`.

A contribution is rendered as `ComponentType<{ payload: unknown }>`, so it
takes one prop and parses it. `Slot` filters by `requires` before rendering,
and wraps each in the contributing plugin's own `fallback`.

`/react` also answers `StartupFailure`, `StatusPageProvider`, `useDismiss`,
`useEventCallback` and `useFocusTrap`. `NotFound` is not optional: assembling
routes without it throws.

## Faults

`Fault` while booting, `KernelFault` from a contract, `TransportFault` from a
request. Each carries a `code` and sets `name`.

```ts
TransportFault: { code; status?; method; path; retryable; body }
```

`body` is what the server sent with its refusal, unread: a form finds its
field errors there. `retryable` says whether asking again could differ.

## Testing

```ts
import { boundaries, wiring, styling, missing, oversized, undocumented } from "@onetype/stack-app-kit/testing";
```

Each takes a path and answers what is wrong, so a test asserts an empty array.
`wiring` finds a declared field nothing reads, `styling` a `var()` naming a
token nothing declares, `boundaries` an import that
crossed one, and the last three what a document promised and does not hold.
