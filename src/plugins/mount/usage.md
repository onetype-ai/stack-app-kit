# mount

## Description

Brings an application up in one call: transport, kernel, plugins, in order.

## Purpose

Every application otherwise writes the same sixty lines to start: build a
client, connect it, hold the rejections that arrive too early, build a kernel,
start it, replay what was held. None of that differs between applications.

## Usage

```ts
import { discover, start } from "@onetype/stack-app-kit";

const app = await start({
    plugins: discover(import.meta.glob("./plugins/*/plugin.ts", { eager: true })),
    transport: { baseUrl: "/api", wsUrl },
    permissions: { granted: () => user.permissions },
    cache: cache.fromQueries(queryClient),
});

app.kernel;     // what the React entry renders through
app.channel;   // "ws" or "http"
await app.stop();
```

- `discover` finds plugins from the filesystem and sorts them by name. Adding
  one is a folder; forgetting to register it is not a failure mode.
- The transport connects **before** the kernel starts, so a plugin's `setup`
  can make a request.
- The kernel starts **last**, so a refused contract stops everything before a
  plugin has run.
- A 401 that lands before the kernel exists is held and replayed once a plugin
  can hear it. Dropping it would sign a user out with nothing on screen.
- `stop` unwinds the plugins, then the socket.

## Refuses

- A module under the glob with no default export, naming the path.
- Whatever the kernel refuses: `start` throws it unchanged, and the message
  names the plugin, the key and the fix.
