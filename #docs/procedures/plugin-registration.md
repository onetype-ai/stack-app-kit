# Procedure: plugin registration

How one of our plugins joins the kernel. Compile-time only: nothing is loaded
at runtime.

```ts
export const transport: Plugin = {
    name: "transport",
    needs: ["config"],
    boot,
};
```

`name` is lowercase, one word, matches the folder. `needs` lists plugin names
whose API this one calls. `boot` receives the host.

`src/index.ts` is the one file that names our plugins, and the only place a
plugin name appears outside its own folder:

```ts
export { transport } from "./plugins/transport/api";
```

## Boot

The kernel sorts by `needs` and boots in dependency order. A cycle is a startup
error naming both plugins.

`boot` may read config, offer an API, subscribe to events and claim hook
points. It must not do work: no requests, no sockets, no timers, no DOM. Slow
or failing setup belongs in `start`.

```ts
function boot(host: Host)
{
    const held = createSocket(config(host));

    host.offer("transport", held);
    host.on("session.ended", held.close);
}
```

## Lifecycle

```
validate  every contract, before anything runs
boot      wiring, dependency order
start     work begins, same order
stop      reverse order
```

A plugin throwing from `boot` or `start` stops the kernel, named. `stop` errors
are logged; the remaining plugins still stop.

## Refuses

- A name already registered, or one that is not `[a-z0-9-]`.
- A `needs` entry no plugin provides, or a cycle.
- `offer` after boot, or a second `offer` under one name.
- Work in `boot` rather than `start`.
