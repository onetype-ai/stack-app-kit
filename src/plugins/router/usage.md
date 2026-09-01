# router

## Description

Turns the routes plugins declared into a route tree the application renders.

## Purpose

Every application otherwise writes the same twenty lines: walk what the kernel
holds, wrap each page in its guard, hang them off a root. The kernel already
knows which routes exist and who may see them, so the only part left is the
shape one library wants.

The library is a parameter, not an import. Swapping routers changes this
plugin and nothing any plugin wrote.

## Usage

```ts
import { createRootRoute, createRoute, createRouter } from "@tanstack/react-router";
import { routerPlugin } from "@onetype/stack-app-kit";

const built = router.from(host)?.build(kernel, { shell: AppShell, missing: NotFound },
    (route) => () => <RouteGuard route={route} />);
```

Or through `mount`, which passes all of it for you.

- Routes come from `kernel.routes()`, in the order plugins booted.
- Every page is wrapped by the guard the caller supplies, which is where 403
  and the plugin's own fallback happen.
- The frame is one component around every page, and the 404 for a path nothing
  declared.

## Refuses

Nothing itself. A route that cannot be built is refused at startup by the
kernel, which checked the path before this ever saw it.
