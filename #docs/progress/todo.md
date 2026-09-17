# todo

Ordered by what blocks the most. What is done is in `done.md`.

1. **Nothing runs in a real browser on its own.** Three manual passes have now
   each found something no test runner reached: a stylesheet against tokens
   that do not exist, a double render `renderHook` will not reproduce, and a
   frame that rendered its shell around nothing because the router hands the
   page to an outlet. Each needed a person to drive a browser. The application
   on top runs one in `verify` again; this package has nothing of its own.

## Known, and deliberate

- **A socket nobody opened is a state, not a fault.** `channel()` answers
  `http` and `subscribe` delivers nothing, so a caller needs no branch. Easy to
  "fix" into a refusal; a test says not to.
- **The failure screen is the best page here.** `StartupFailure` has spacing,
  hierarchy and a monospace body. Nothing a reader is meant to see does.
- **Comments live only where they reach a reader.** A JSDoc block on something
  the package publishes, and nothing else: `findPrivateComments()` refuses one
  that never reaches `dist`. An application on top holds to zero, because
  nobody imports its source.
