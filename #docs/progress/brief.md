# brief

Ten plugins work. 562 tests, every one watched to fail. `done.md` logs the
guarantees one by one.

An application declares plugins with `definePlugin` and brings them up with
`start`, which answers a kernel and the router built from what those plugins
declared. It renders through `Slot` and `RouteGuard`. `transport` carries
requests over a socket where there is one and HTTP where there is not.
`/testing` answers the checks a project runs on itself, and `fakeContext` a
context that answers the way the real one does.

What is left of an application's own composition is 31 lines, and its whole
test suite is eight tests.

## Next

`todo.md`. Nothing here runs in a real browser on its own. The router was
proved in one by hand — a frame rendering nothing was found that way and by
nothing else — but a browser has to be driven by a person each time, which is
the standing gap.
