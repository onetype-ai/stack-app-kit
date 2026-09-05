# Procedure: testing

Every plugin tests itself, from outside, through its `api.ts`.

## Where

```
src/plugins/<name>/tests/
    api.test.ts
    <subject>.test.ts
```

A test imports the plugin the way another plugin does, from `../api`. Never
from `../internal/`. A test needing an internal tests implementation: either
`api.ts` lacks something, or the test does not belong.

The kernel's own tests live in `tests/`, against `src/index.ts`.

## Shape

Arrange, Act, Assert, a blank line between:

```ts
test("start refuses a plugin needing one that was not passed", async () => {
    const kernel = createKernel({ plugins: [billing] });

    const failed = await kernel.start().catch((error) => error);

    expect(failed.code).toBe("UNKNOWN_DEPENDENCY");
});
```

Name the case, not the function.

## Rules

- **Isolated.** Each builds its own. Nothing survives between tests.
- **Order independent.** Passes alone, and in any order.
- **No mock of ourselves.** A mocked registry proves the mock works.

Assert on the contract: the thrown code, the returned value, what the
application can observe. Never a private field.

A plugin takes its world as arguments, so a test passes its own: `openSocket`
returns a fake socket. A fake accepting what a real one rejects is where bugs
hide.

## What must be proved

Every refusal in `usage.md` has a test that triggers it. An untested refusal is
a promise.

Before fixing a bug, write the test that fails because of it.

## Refuses

- A test importing another module's `internal/`.
- Shared state between tests.
- A skipped test left in the tree: delete it or fix it.
- A refusal in `usage.md` with no test.
