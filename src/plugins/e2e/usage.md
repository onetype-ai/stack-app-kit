# e2e

## Description

Starts an application's services and a watched browser for end-to-end tests,
from `./e2e` in Node. Playwright is an optional peer.

## Purpose

On a shared machine, a hand-written harness falls back to a silent port,
kills by name and leaks a developer's `.env` into the run.

## Usage

```ts
const stack = await Stack.start({ services: {
    api: { folder: "../api", command: ["pnpm", "dev"], port: 7590, ready: "/ready",
        env: { ...bootEnv("../api/boot.env"), APP_URL: "{app}" } },
    app: { folder: ".", command: ["pnpm", "vite", "--strictPort"], port: 7591,
        env: { VITE_API_URL: "{api}" } },
} });
const browser = await Browsers.launch({ hosts: ["shop.example.test"] });
const { page, problems } = await browser.open();
await page.goto(stack.origins.app);
expect(problems).toEqual([]);
await browser.close();
await stack.stop();
```

- A taken port is refused, naming it; nothing falls back. `freePorts(n)`
  picks ports up front.
- Services start detached and stop by their own process group, SIGTERM then
  SIGKILL; never by name. A failed start stops what did start.
- `ready` is polled until it answers 2xx, before a deadline; a failure
  carries the tail of that service's log.
- A child sees only `PATH`, `HOME`, `TMPDIR`, `LANG` and what `env` gives;
  `NODE_ENV` is `development` unless given; `{name}` becomes that origin.
- `launch` takes the machine-wide browser lock (`lockPath`), one run at a
  time; `problems` holds console errors, uncaught throws and 5xx answers.
- `Hosts.start({ pages })` serves static pages; `startSecure` adds a
  per-run certificate whose `spki` alone `launch` trusts.

## Refuses

A taken port, a hostname or SPKI hash that could inject a flag, a service
that never became ready, and `startSecure` on :443 outside CI.
