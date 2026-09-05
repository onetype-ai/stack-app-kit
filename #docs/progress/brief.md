# brief

Five plugins work. 155 tests, every one watched to fail. `done.md` predates
this count and logs the guarantees one by one.

An application declares plugins with `definePlugin`, builds a kernel with
`createKernel`, and renders through `Slot` and `RouteGuard`. `transport`
carries requests over a socket where there is one and HTTP where there is not.

## Next

The config `tools/check.sh` calls: eslint, then a real application on top,
which is the only thing that finds what a test runner cannot.
