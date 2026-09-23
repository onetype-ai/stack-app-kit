# transport

## Description

One HTTP boundary: base URL, headers, timeouts, retries, one error shape. Uses
a websocket when the server has one, HTTP when it does not.

## Purpose

One boundary means a failure reads the same everywhere. **This layer owns
retrying**: a layer above retrying too turned three attempts into nine.

## Usage

```ts
const booted = boot(log, [transportPlugin({ baseUrl: "/api", wsUrl, openSocket })]);
await booted.start();
const client = transport.from(booted.host);
const body = await client.request({ method: "GET", path: "/items" });
client.subscribe("items", (message) => { … });
```

- `connect` tries the socket once; a second call joins the first.
- `request` answers the body as `unknown`: validate it at the caller.
- Idempotent requests retry with jittered backoff. `POST` and `PATCH` never
  retry or move channel. Both channels send the same headers.
- `wsUrl` may be a function of the headers a request carries now, read on
  every dial; `undefined` means no socket until `reconnect()`.
- `reconnect()` dials again and keeps every subscription: call it after
  sign-in, sign-out or a workspace switch.
- `socketFor: "push"` keeps requests on HTTP.
- A dropped socket fails in-flight requests as `NETWORK` and redials after
  half to all of `reconnectBaseMs · 2ⁿ` (30 s at most). Close 4001 (signed
  out) waits for `reconnect()`; 4000 (lifetime) redials at once.
- With no socket, `subscribe` succeeds and delivers nothing.

## Refuses

A non-2xx throws a `TransportFault` with a code, status, method, path and the
server's body, on either channel. Codes: `NETWORK`, `TIMEOUT`, `ABORTED`,
`UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `RATE_LIMITED`,
`SERVER`, `CLIENT`, `MALFORMED`. An unknown `socketFor` is refused at boot.
