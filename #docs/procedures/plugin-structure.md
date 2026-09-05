# Procedure: plugin structure

One shape, every plugin.

## Layout

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

## Naming

Folder and `name` are the same word: lowercase, no underscores, no `utils` or
`helpers`. A folder that cannot be named in one word is two plugins.

Inside `internal/`, one file per subject: `socket.ts`, `retry.ts`,
`request.ts`. Not `manager.ts` or `handler.ts`: those name a pattern, not a
responsibility.

## Files

A file does one thing. When it stops fitting on a screen, the second thing it
grew is a separate file or a separate plugin.

One exported thing per `internal/` file, plus the types it needs. Comments
where a reader would ask why, not what the line does.

## usage.md

Written first, before the API and before any code: it decides the shape. Its
reader is an application developer who will never open `internal/`.

Sections in order: `Description`, `Purpose`, `Usage`, `Refuses`. Technical,
proven, copy-pasteable. What the plugin does, never what it will do.

## Refuses

- A top-level file that is not one of the six named.
- `usage.md` over 1800 characters, or absent.
- A plugin with no `tests/`.
