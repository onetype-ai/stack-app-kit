# Registries and pipelines

A **registry** is a named list one plugin declares and its dependants fill.

```ts
registries: { "editor.blocks": { describe, entry: Block, key: "id",
    cap: 64, reserved: ["core"], replace: "refuse", set: "dependants" } },
adds: { "editor.blocks": [{ id: "quote", label: "Quote", order: 20 }] },
const stop = ctx.registry("editor.blocks").set(entry); // useRegistry(name)
```

- `adds` and `set` get the same checks: schema, key, reserved, cap. A slot
  is a registry too: `set({ render })` renders in its `<Slot>`.
- Entries list by `order`, then key, minus what the viewer lacks the
  `requires` for.
- `remote: "<api registry>"` mirrors the server's: a snapshot, then pushes,
  refetched after a gap or reconnect, emptied on `session.changed()`.

A **pipeline** is ordered steps; dependants add steps beside an anchor.

```ts
pipelines: { "posts.publish": { describe, input: Draft, output: Post,
    steps: [{ id: "validate", run }, { id: "store", run }] } },
adds: { "posts.publish": [{ id: "moderate", after: "validate", run }] },
await ctx.pipeline("posts.publish").run(draft);
```

- A step is `run(state, ctx, { stop })`. It answers the next state, or
  `stop(output)` to end the run early.
- Input and output are checked. `kernel.explain(name)` answers the order;
  start logs it, each step its outcome (never state).
- **No transaction.** A step writing opens its own; one calling a provider
  (LLM, HTTP, storage) never writes in it, or locks are held for seconds.

## Refuses

- At start, all at once:
  - an undeclared name, or an addition from a non-dependant;
  - a bad entry; a step with no anchor, an unknown one, or a taken id;
  - an anchor cycle.
- At run time: a bad `set`, a refused input or output, and a failing
  step (`PIPELINE_FAILED`).
