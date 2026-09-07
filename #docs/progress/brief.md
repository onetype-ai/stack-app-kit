# brief

Five plugins work. 225 tests, every one watched to fail. `done.md` logs the
guarantees one by one.

An application declares plugins with `definePlugin`, builds a kernel with
`createKernel`, and renders through `Slot` and `RouteGuard`. `transport`
carries requests over a socket where there is one and HTTP where there is not.
`/testing` answers the checks a project runs on itself, and `fakeContext` a
context that answers the way the real one does.

## Next

`todo.md`. Nothing here runs in a real browser on its own, which is the one
class of defect a test runner cannot reach.
