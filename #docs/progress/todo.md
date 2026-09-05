# todo

Ordered by what blocks the most. What is done is in `done.md`.

1. **Nothing runs in a real browser on its own.** One manual pass found a
   stylesheet against tokens that do not exist, and a double render
   `renderHook` will not reproduce.

## Known, and deliberate

- **A socket nobody opened is a state, not a fault.** `channel()` answers
  `http` and `subscribe` delivers nothing, so a caller needs no branch. Easy to
  "fix" into a refusal; a test says not to.
- **The failure screen is the best page here.** `StartupFailure` has spacing,
  hierarchy and a monospace body. Nothing a reader is meant to see does.
