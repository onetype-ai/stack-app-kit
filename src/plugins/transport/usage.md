# transport

## Description

One HTTP boundary (base URL, headers, timeouts, retries, errors), plus a
websocket when the server has one.

## Purpose

**This layer owns retrying**: a retry above it turned three into nine.

## Usage

```ts
const items = await client.request({ method: "GET", path: "/items" });
client.subscribe("items.changed", (item) => { … }, (code) => { … });
await client.upload({ path: "/items/1/files", body: file, onProgress, signal });
```

- `request` answers `unknown`: validate it. Idempotent requests retry with
  jittered backoff; `POST`/`PATCH` never retry or change channel. One set
  of headers; a request with its own `Authorization` or `Cookie` goes by
  HTTP, since the socket speaks for whoever dialled it.
- `upload` sends a `Blob` or `FormData` via `XMLHttpRequest` (or
  `uploader`), with progress; never retried.
- `wsUrl` may be a function of the headers sent now (`undefined`: no
  socket yet); `reconnect()` redials, keeping subscriptions.
  `socketFor: "push"` keeps requests on HTTP.
- A drop fails in-flight requests (`NETWORK`) and redials after half to all
  of `reconnectBaseMs · 2ⁿ` (≤ 30 s) or a server `$backoff`. 4001/4003
  wait for `reconnect()`; 4000 redials at once. After a `$ping`,
  `silenceMs` of quiet redials; `wake(listener)` redials at once.
- `onReconnected({ downMs })` runs once `$ready` and every channel answered:
  pushes missed meanwhile are lost.
- No socket: `subscribe` succeeds, delivering nothing.

## Refuses

A non-2xx throws a `TransportFault` with the server's body: `NETWORK`,
`TIMEOUT`, `ABORTED`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`,
`RATE_LIMITED`, `SERVER`, `CLIENT`, `MALFORMED`, `OFF_BASE` (off the base
URL). An unknown `socketFor` at boot; a declined channel calls `refused`.
