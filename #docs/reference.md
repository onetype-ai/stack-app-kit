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

`http`, `cache` and `realtime` arrive without being declared: they are the
kit's own plugins, and naming one in `dependsOn` fails startup.

`hooks.run` answers the first refusal, or nothing. `use` reaches another
plugin's services outside a component, so a plain function can call it.

A plugin aliases its own shape once: `type Inside = Context<Config, Services>`.

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
```

`/react` also answers `StartupFailure`, `StatusPageProvider`, `useDismiss`,
`useEventCallback` and `useFocusTrap`. `NotFound` is not optional: assembling
routes without it throws.

## Faults

`Fault` while booting, `KernelFault` from a contract, `TransportFault` from a
request. Each carries a `code` and sets `name`.

## Testing

```ts
import { boundaries, wiring, styling, missing, oversized, undocumented } from "@onetype/stack-app-kit/testing";
```

Each takes a path and answers what is wrong, so a test asserts an empty array.
`wiring` finds a declared field nothing reads, `styling` a `var()` naming a
token nothing declares, `boundaries` an import that
crossed one, and the last three what a document promised and does not hold.
