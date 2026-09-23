# logs

## Description

A leveled logger for `start({ log })`, and a shipper that sends what a
browser logged to the application's own endpoint, batched and redacted.

## Purpose

A failure in someone's browser is otherwise seen only by them. Shipping by
hand floods the server on a loop and carries tokens out in `about`.

## Usage

```ts
const shipper = logs.shipper({
    level: "warn",
    send: logs.postTo(`${apiUrl}/client-logs`),
    every: (run) => setInterval(run, 10_000),
});
addEventListener("pagehide", () => shipper.flush(true));

const log = logs.create({ level: "info", write: [logs.toConsole, shipper.write] });
logs.captureErrors(log, window);

await start({ plugins, log, transport });
```

- An entry is `{ level, at, plugin?, line, about? }`; `plugin` is read from
  the `"<plugin>: "` prefix `start` gives every plugin's line.
- The shipper sends `{ entries }` as JSON: at most 20 entries and 30 kB a
  request (the rest on the next tick), text clipped to 500 characters, 20 keys of `about`. A line
  already waiting counts `about.repeated` instead of queuing again.
- `about` keys naming a token, secret, password, API or private key,
  cookie, session, credential or authorization, and values shaped like a bearer token, JWT or `sk_` key,
  ship as `[redacted]`.
- A 429 pauses shipping for a minute and drops what waits.
- `flush(true)` sends with `keepalive`, for a page being left.
- `captureErrors` logs uncaught errors and unhandled rejections; it answers
  a stop.

## Refuses

An unknown `level`, naming the four there are. A failed send is dropped, never
retried: logging must not become the load it reports.
