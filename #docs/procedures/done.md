# Procedure: done

Done when all five hold, not when it compiles. Each was learned from a build
that shipped without it.

1. **`usage.md` is true today**, never what it will do.
2. **Every guarantee was watched to fail.** This caught tautological assertions
   twice in the previous build, one written minutes earlier.
3. **Nothing declared is unreachable.** For every field in a contract, find the
   code that reads it. A declared field nothing reads is worse than a missing
   one, because the document promises it works: the largest class of defect in
   the previous build, and neither types nor tests caught any of it. `findUnusedFields()`
   is a floor, not a substitute for reading.
4. **It ran in a browser.** A test runner cannot see a `Slot` rendering
   nothing, a subscription never delivering, or a boot rejection reaching no
   screen.
5. **Every check is as strong as its rule.** Violate the rule on purpose and
   confirm the check names the violation. Parse what the code does, never what
   it declares: cycle detection over a declared list catches metadata, while
   the real cycle is in the imports.

## Refuses

- A claim in `usage.md` no code supports.
- A test never watched to fail.
- A declared field nothing reads.
- A check never proved against a deliberate violation.
- "Done" on something that has only ever run in a test runner.
