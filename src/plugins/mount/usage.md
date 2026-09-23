# mount

## Description

Brings an application up in one call: transport, kernel, plugins, in order.

## Purpose

Every application otherwise writes the same sixty lines to start, and none of
them differ between applications.

## Usage

```ts
import { discover, start } from "@onetype/stack-app-kit";

const app = await start({
    plugins: discover(import.meta.glob("./plugins/*/plugin.ts", { eager: true })),
    transport: { baseUrl: "/api", wsUrl },
    grantedBy: "auth",
    cache: cache.fromQueries(queryClient),
});

app.kernel;     // what the React entry renders through
app.channel;   // "ws" or "http"
app.realtime.reconnect(); // after a sign-in or workspace switch
await app.stop();
```

- `discover` finds plugins from the filesystem and sorts them by name. Adding
  one is a folder; forgetting to register it is not a failure mode.
- HTTP is ready **before** the kernel starts, so a plugin's `setup` can make
  a request. The socket dials once every plugin started, so its address
  carries their `sends`.
- The kernel starts **last**, so a refused contract stops everything before a
  plugin has run.
- A 401 that lands before the kernel exists is held and replayed once a plugin
  can hear it. Dropping it would sign a user out with nothing on screen.
- `stop` unwinds the plugins, then the socket.
- One plugin answers `grants`: the one `grantedBy` names, or, left out, the
  only one declaring it, which may own permissions under its own name. With
  no granter, pass `permissions`; passing both warns, naming the winner.

## Refuses

- A module under the glob with no default export, naming the path.
- Whatever the kernel refuses: `start` throws it unchanged, and the message
  names the plugin, the key and the fix.
