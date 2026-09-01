# architecture

One package a Stack front-end is built on: a kernel holding the seams, and the
plugins we ship behind it.

Read this, then `procedures/`, then the `usage.md` of what you touch.

## Shape

```
src/kernel/          our runtime: boot order, offer/take, events
src/plugins/<name>/  one capability, behind a declared contract
src/index.ts         the public surface, the one file naming plugins
#docs/procedures/    the rules everything follows
tools/               the checks CI runs
```

`.` is pure and runs without a DOM; `./react` needs React.

The kernel names no plugin; a plugin names only what it declared in `needs`.
`tools/boundaries.mjs` enforces it by resolving import paths rather than
matching text: a relative path climbing out of a folder reaches the same
private file, and a rule reading the specifier alone calls that clean.

`tools/wiring.mjs` refuses a declared field nothing reads: the largest class of
defect in the build before this one, and types caught none of it.

## Two kinds of plugin

Ours ship with the package: `transport` is one. The application's are values it
passes to `createKernel`, and never live here. Both reach a kernel alike.

One plugin is one capability: replace the technology behind it and exactly one
folder changes.

TypeScript enforces none of this at runtime, and module side effects run in an
order nothing defines. That is why the registry earns its weight here, and why
it would not in a language whose compiler already refuses a cycle.

## Validation

Everything is checked before anything starts, and every problem is reported at
once: four mistakes should take one run to learn, not four.

`start` brings up every plugin or throws. Nothing partially starts, because a
half-started kernel behaves according to where it stopped.
