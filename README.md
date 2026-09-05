# stack-app-kit

One package a Stack front-end is built on. A kernel that holds the seams, and
the plugins we ship behind it.

This is a library. It carries no routes, no pages and no features: what the
application is, the application writes.

## Use

```ts
import { discover, start } from "@onetype/stack-app-kit";

const app = await start({
    plugins: discover(import.meta.glob("./plugins/*/plugin.ts", { eager: true })),
    transport: { baseUrl: "/api" },
});
```

`start` brings up the transport, validates every contract, and either starts
every plugin or throws naming the one that failed. Nothing partially starts.

Three entries: `.` is pure and runs without a DOM, `./react` renders, and
`./testing` holds the checks an application calls from its own tests.

## Layout

```
src/kernel/          our runtime: boot order, offer/take, events
src/plugins/<name>/  one capability each, behind a declared contract
src/testing/         the checks an application runs on itself
src/index.ts         the one file that names our plugins
#docs/               architecture, procedures, progress
tools/               the checks CI runs
```

A plugin declares everything crossing its boundary: dependencies, public API,
events, hooks, config. What is not declared does not exist, and the kernel
refuses it before anything starts.

## Work on it

`#docs/architecture.md` is the map, `#docs/reference.md` what a context and a
kernel hand you, `#docs/procedures/` the rules, and each plugin's `usage.md`
its contract. That is the whole context needed for one
plugin.

```sh
tools/check.sh
```

Runs what CI runs: types, lint, tests, the 1800-character limit, and the
plugin boundaries.

Every check here was broken on purpose and watched to fail. One that has never
been red proves only that it runs.
