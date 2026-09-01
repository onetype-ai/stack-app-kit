# brief

## What this is

One package a Stack front-end is built on: a kernel that holds the seams, and
the plugins we ship behind it. A library — what the application is, the
application writes.

## Two kinds of plugin

Ours live in `src/plugins/` and ship with the package. The application's are
values it passes to `createKernel`, and never live here. Both reach a kernel
the same way; the difference is who wrote them and what a failure means.

## Why a kernel here

Go gets its boundaries from the compiler: an import graph it checks, an
`internal/` it enforces, a build that refuses a cycle. TypeScript has none of
that at runtime, and module side effects run in an order nothing defines.

So a registry is not duplicating the language, as it would be in Go. It is
where the boundary exists at all, which is why it validates everything before
anything starts.

## Where we are

Both plugins work. 87 tests, every one watched to fail before it was trusted.

An application declares plugins with `definePlugin`, builds a kernel with
`createKernel`, and renders through `Slot` and `RouteGuard`. `transport`
carries requests over a socket where there is one and HTTP where there is not.

## Next

The config `tools/check.sh` calls — eslint and prettier — then a real
application on top, which is the only thing that finds what a test runner
cannot.
