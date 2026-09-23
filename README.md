# stack-app-kit

One package a Stack front-end is built on: a kernel that holds the seams, and
the plugins we ship behind it.

A library: no routes, no pages, no features. What the application is, the
application writes.

## Use

```sh
npm install @onetype/stack-app-kit
```

```ts
import { discover, start } from "@onetype/stack-app-kit";

const app = await start({
    plugins: discover(import.meta.glob("./plugins/*/plugin.ts", { eager: true })),
    transport: { baseUrl: "/api" },
});
```

`start` validates every contract, then starts every plugin or throws naming
the one that failed. Nothing partly starts.

Three entries: `.` is pure and runs without a DOM, `./react` renders (React
is an optional peer), and `./testing` holds the checks an application runs.

`npx stack-app-kit-schemas` writes `schemas.md`, the installed kit's surface;
`--check` fails when it is stale.

## Layout

```
src/kernel/          boot order, offer/take, events
src/plugins/<name>/  one capability each, behind a contract
src/testing/         the checks it runs on itself
src/index.ts         the one file naming our plugins
#docs/               architecture, procedures
bin/, tools/         the schemas writer; the checks CI runs
```

A plugin declares everything crossing its boundary: dependencies, public API,
events, hooks and config. What is not declared does not exist, and the kernel
refuses it before anything starts.

## Work on it

`#docs/architecture.md` is the map, `#docs/reference.md` what a context and a
kernel hand you, `#docs/procedures/` the rules, each `usage.md` a contract.

```sh
tools/check.sh
```

Runs what CI runs: types, lint, tests, sizes, the surface and boundaries.

Every check here was broken on purpose and watched to fail. One that has never
been red proves only that it runs.
