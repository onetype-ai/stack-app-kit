# todo

1. **A lint rule nobody proved is a lint rule nobody has**: both patterns here
   were dead until a file that breaks them was written. A flat config replaces
   `no-restricted-imports` rather than merging it, so two blocks naming it
   leave one silently doing nothing
2. **Run it in a browser, every time**: one pass was done. Routes render, the
   guard refuses naming the permission it wanted, and the tokens reach the
   page. It also showed that no unit has a style yet, which vitest cannot see
3. **A worked example that does something**: the application boots its own
   plugins in a test now, but the demo is still one plugin with no styling
4. **A socket nobody opened is a state, not a fault**: `channel()` answers
   `http` and `subscribe` delivers nothing. Tested, and easy to "fix" wrongly
5. **The failure screen is the best page here**: `StartupFailure` has spacing,
   hierarchy and a monospace body. Nothing a reader is meant to see does
6. **State that outlives a route**: a flow spanning routes unmounts each page,
   and nothing here says where that state lives
7. **URL state**: a route declares no search parameters, in a kit whose rule
   is that undeclared means it does not exist
8. **Guards that depend on data**: a route guard expresses permissions only,
   so anything else becomes a redirect that flashes the wrong screen first
