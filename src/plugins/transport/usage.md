# transport

## Description

One HTTP boundary (base URL, headers, timeouts, retries, one error shape),
plus a websocket when the server has one.

## Purpose

A failure reads the same everywhere. **This layer owns retrying**: retrying
above it turned three attempts into nine.

## Usage

```ts
const client = transport.from(booted.host);
const items = await client.request({ method: "GET", path: "/items" });
client.subscribe("items.changed", (item) => { … }, (code) => { … });
```

- `request` answers the body as `unknown`: validate it. Idempotent requests
  retry with jittered backoff; `POST`/`PATCH` never retry or move channel.
  Both channels send the same headers.
- `wsUrl` may be a function of the headers sent now, read on every dial;
  `undefined` means no socket yet. `reconnect()` dials again, keeping every
  subscription. `socketFor: "push"` keeps requests on HTTP.
- A drop fails in-flight requests as `NETWORK` and redials after half to all
  of `reconnectBaseMs · 2ⁿ` (≤ 30 s), or longer if the server sent
  `$backoff`. Close 4001/4003 waits for `reconnect()`; 4000 redials at once.
- Once the server sent `$ping`, `silenceMs` without a frame redials.
- `wake(listener)` redials at once when the device is back.
- `onReconnected({ downMs })` runs after `$ready` and every channel answered
  (or `connectTimeoutMs` on older servers): pushes missed meanwhile are gone.
- With no socket, `subscribe` succeeds and delivers nothing.

## Refuses

A non-2xx throws a `TransportFault` (code, status, method, path, the server's
body) on either channel: `NETWORK`, `TIMEOUT`, `ABORTED`, `UNAUTHORIZED`,
`FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `RATE_LIMITED`, `SERVER`, `CLIENT`,
`MALFORMED`. An unknown `socketFor` is refused at boot. A declined channel
calls `refused` with its code.
