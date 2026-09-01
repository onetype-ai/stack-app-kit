# transport

## Description

One HTTP boundary: base URL, headers, timeouts, retries, one error shape. Uses
a websocket when the server has one and falls back to HTTP when it does not.

## Purpose

Every caller otherwise carries its own fetch, its own retry and its own idea
of what an error is. One boundary means a failure reads the same everywhere.

**This layer owns retrying.** Anything above it must not retry as well: three
attempts over three became nine requests and a twenty-second wait.

## Usage

```ts
const booted = boot(say, [transportPlugin({ baseUrl: "/api", wsUrl })]);

await booted.start();

const held = transport.from(booted.host);

const body = await held.request({ method: "GET", path: "/items" });

const subscription = held.subscribe("items", (message) => { … });
```

- `start` calls `connect`, which tries the socket once and answers which
  channel is live. A no-op on repeat: a second call joins the first, so two
  sockets never deliver one push twice.
- `request` returns the body as `unknown` — validate it at the caller.
- Idempotent requests retry with growing backoff. `POST` and `PATCH` never
  retry and never move channel, so a request cannot apply twice.
- With no socket, `subscribe` succeeds and delivers nothing, so a caller needs
  no branch.
- When the socket drops, requests move to HTTP at once, in-flight ones fail as
  `NETWORK` rather than hanging, and it reconnects.

## Refuses

A non-2xx status throws a `TransportFault` carrying a code, the status, the
method, the path, and the body the server sent — a form needs the field errors
inside it. `code` is one of `NETWORK`, `TIMEOUT`, `ABORTED`, `UNAUTHORIZED`,
`FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `RATE_LIMITED`, `SERVER`, `CLIENT`,
`MALFORMED`. Messages never expose an internal path.
