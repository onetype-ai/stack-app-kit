# Procedure: the React boundary

The package has two surfaces, and the line between them is the point of the
split.

```
.        pure. No React, no DOM. Runs in a test, a worker, on a server.
./react  components and hooks.
```

## The rule

The pure entry imports nothing from React and touches no DOM. That holds for
the kernel and for every plugin: a plugin's `api.ts` is pure, and what it puts
in a view is its `react.tsx`, which imports from `internal/` and never the
other way.

A kernel needing React to validate a contract would be untestable without a
renderer.

## What goes where

The kernel holds the registry, validation, events, hooks, permissions and
state. The React entry holds the Provider, `Slot`, `RouteGuard` and hooks.

The test: could it run in a Node script with no DOM? Then it is core. Does it
render or read the document? Then it is React.

A component holds no logic. `Slot` asks the core what contributions exist and
who may see them; it decides neither.

## Dependencies

React is an optional `peerDependency`, never a dependency: the application
owns the instance, and a second copy breaks hooks with an error naming
neither. Optional, because the pure entry needs no React at all.

## State reaching React

The core owns state and notifies; React subscribes through
`useSyncExternalStore`, so a render is never torn. The core re-renders
nothing: it says what changed, and the React entry decides what that means.

Every contribution renders behind its own error boundary.

## Refuses

- React, `document` or `window` reachable from the pure entry.
- `internal/` importing `react.tsx` or an entry.
- React as a dependency rather than a peer.
- Logic in a component that the core could hold.
- A contribution rendered outside an error boundary.
