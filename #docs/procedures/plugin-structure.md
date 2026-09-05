# Procedure: plugin structure

One shape, every plugin.

```
src/plugins/<name>/
    usage.md        contract, <= 1800 characters, required
    plugin.ts       registration: name, needs, boot
    api.ts          public surface, the only importable file
    events.ts       events published and consumed
    hooks.ts        hook points offered and claimed
    react.tsx       what this plugin contributes to a view
    internal/       private, one file per subject
    tests/
```

`events.ts`, `hooks.ts` and `react.tsx` are omitted when a plugin has none.
Nothing else lives at the top level.

Folder and `name` are the same word, lowercase, no underscores. A folder that
cannot be named in one word is two plugins. Inside `internal/`, one file per
subject: `socket.ts`, `retry.ts`, `request.ts`. Not `manager.ts` or
`handler.ts`: those name a pattern. One exported thing per file.

## usage.md

Written first, before the API and before any code: it decides the shape. Its
reader is an application developer who will never open `internal/`.

Sections in order: `Description`, `Purpose`, `Usage`, `Refuses`. Technical,
proven, copy-pasteable. What the plugin does, never what it will do.

## Refuses

- A top-level file that is not one of the six named.
- `usage.md` over 1800 characters, or absent.
- A plugin with no `tests/`.
