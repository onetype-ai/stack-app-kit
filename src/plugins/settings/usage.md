# settings

## Description

Reads plugin config from the environment the bundler exposes, and refuses a
public variable that looks like a secret before anything is built.

## Purpose

Every `VITE_` value ships inside the public bundle. An application that maps
variables onto config by hand also leaks one by hand, sooner or later.

## Usage

```ts
// main.tsx: VITE_ITEMS__PAGE_SIZE=20 becomes config.items.pageSize
const app = await start({ plugins, environment: import.meta.env, transport });

// vite.config.ts: the build stops on a secret-looking name
plugins: [settings.refusingSecrets(Object.keys(loadEnv(mode, ".", "")))],
```

- A plugin's variables are `VITE_<PLUGIN>__<FIELD>`: the plugin name in
  upper case with `-` as `_`, then the field in upper snake case.
- Values reach the plugin as strings; its `config` schema coerces them
  (`z.coerce.number()`), and a refusal names the plugin and field.
- Config passed to `start` for a plugin wins over its variables.
- `settings.configFor(plugins, environment)` answers the same map, for a
  test or a kernel built with `createKernel`.
- Application-wide names are allowed by listing them exactly, and a listed
  name is trusted even if it reads like a secret (a publishable key):
  `refusingSecrets(names, { application: ["VITE_API_URL"] })`.

## Refuses

All problems at once, one line each:
- an unlisted name holding `SECRET`, `TOKEN`, `KEY`, `PASS`, `PWD`,
  `AUTH`, `BEARER`, `SESSION`, `COOKIE`, `PRIVATE`, `CREDENTIAL`, `SIGNING`;
- a plugin field not ending in `_URL`, `_ORIGIN(S)`, `_ENABLED`, `_MODE`,
  `_LEVEL`, `_SIZE`, `_LIMIT` or `_LOCALE`;
- a variable for a plugin that declares no config, or no such field;
- a `VITE_` name that is neither a plugin's nor listed as application-wide.
