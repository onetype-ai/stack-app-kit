# cache

## Description

Turns a query client into the `ctx.cache` every plugin receives.

## Purpose

Dropping what a view holds is three lines, and an application that writes them
itself writes them once per project and gets them subtly different each time.

The library is a parameter, not an import: the kit forces no version, and a
test passes a fake with no query client at all.

## Usage

```ts
import { cachePlugin } from "@onetype/stack-app-kit";

const kernel = createKernel({
    plugins: discover(),
    cache: cache.fromQueries(queryClient),
});
```

Inside a plugin:

```ts
listens: {
    "auth.signed-out": {
        describe: "Drops cached items so the next user sees none of the last one's.",
        handle: (_payload, ctx) => ctx.cache.invalidate(["demo", "items"]),
    },
},
```

- `invalidate` takes a key as an array, and passes it on unchanged.
- The key is copied before it is handed over, so a caller holding the array
  cannot change what was invalidated.
- Nothing here caches. It drops what something else is holding, which is the
  only part every application does the same way.

## Refuses

Nothing. An invalidation for a key nothing holds is not an error: it is a view
that had already moved on.
