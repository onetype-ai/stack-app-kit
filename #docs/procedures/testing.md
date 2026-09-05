# Procedure: testing

Every plugin tests itself, from outside, through its `api.ts`, from `../api`
and never `../internal/`. A test needing an internal tests implementation:
either `api.ts` lacks something, or the test does not belong. The kernel's own
live in `tests/`, against `src/index.ts`.

```ts
test("start refuses a plugin needing one that was not passed", async () =>
{
    const kernel = createKernel({ plugins: [billing] });

    const failed = await kernel.start().catch((error) => error);

    expect(failed.code).toBe("UNKNOWN_DEPENDENCY");
});
```

Name the case, not the function. Assert on the contract: the thrown code, the
returned value, what the application can observe. Never a private field, never
a mock of ourselves.

A plugin takes its world as arguments, so a test passes its own: `openSocket`
returns a fake socket. A fake accepting what a real one rejects is where bugs
hide.

## What must be proved

Every refusal in `usage.md` has a test that triggers it. An untested refusal is
a promise. Before fixing a bug, write the test that fails because of it.

`render` and `renderHook` do not wrap in `StrictMode`; `main.tsx` does, so an
updater that runs twice in a browser runs once here. Wrap the case in
`<StrictMode>` when it proves something happens once.

## Refuses

- A test importing another module's `internal/`.
- Shared state between tests.
- A skipped test left in the tree.
- A refusal in `usage.md` with no test.
