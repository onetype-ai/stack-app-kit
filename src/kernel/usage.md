# kernel (ours)

## Description

The runtime that holds this package's own plugins: registry, boot order,
events. Not what an application uses: that is `plugins/kernel`.

## Purpose

Our plugins need the same thing an application's do: a declared boundary, a
dependency order, and one place that refuses what was not declared. Keeping
them apart means `transport` can be replaced without the application noticing.

## Usage

```ts
const booted = boot(say, [kernelPlugin(), transportPlugin(settings)]);

await booted.start();

const client = transport.from(booted.host);
```

- `boot` orders plugins by `needs` and wires each. Wiring only: a plugin that
  did work here would act before the plugins it needs had wired.
- `start` runs each plugin's `start` in boot order. A failure stops the ones
  already started, in reverse, so a half-started agent never keeps running.
- `stop` unwinds in reverse and keeps going past a failure.
- `host.offer` publishes an api, `host.take` reads one. Take once, at boot.
- `host.on` and `host.emit` carry events between our plugins. A listener that
  throws is caught and reported: it reaches neither the emitter nor the others.
- Ties in boot order break by name, so one set is always one order.

## Refuses

- `NO_NAME`, `NO_BOOT`: a plugin without a name, or without `boot`.
- `REGISTERED_TWICE`: one name given twice.
- `UNKNOWN_NEED`: a `needs` entry no plugin provides, naming it.
- `CYCLE`: plugins needing each other, naming the loop.
- `NOT_BOOTING`: offering or subscribing after boot.
- `OFFERED_TWICE`: a second api under one name, naming the first owner.
