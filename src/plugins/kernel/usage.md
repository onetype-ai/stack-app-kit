# kernel

## Description

The plugin runtime: contract validation, events, hooks, slots,
registries, permissions.

## Purpose

A plugin declares what crosses its boundary and the kernel refuses the
rest, so a feature is added and removed in one folder.

## Usage

```ts
export default definePlugin("auth", {
    version: "1.0.0",
    describe: "Owns the session.",
    dependsOn: ["transport"],
    services: (ctx) => ({ session: session(ctx) }),
    emits: { "auth.signed-out": { describe: "Session ended.", schema } },
});
```

```ts
const kernel = createKernel({ plugins: [auth, billing], config, http, permissions });

await kernel.start();
```

`start` validates first, naming every problem at once.

```tsx
<KernelProvider kernel={kernel}>
    <Slot name="notes.actions" payload={{ noteId }} />
    <RouteGuard route={route} />
</KernelProvider>
```

`Slot` renders contributions in `order` with the validated payload, each in
a boundary, hiding what the viewer may not see.
`usePlugin("auth")` returns its context; `ctx.use("auth")` does so outside a
component. Registries and pipelines: #docs/procedures/registries-and-pipelines.md. `ctx.http` answers the body: a 204 is `undefined`, a non-2xx
throws.

## Refuses

At startup: a duplicate plugin, an unknown or cyclic dependency, a name
outside the plugin's namespace, a duplicate route, slot, registry, event, hook,
command or permission, a bad registry entry (schema, taken or reserved
key, cap), a reference to anything undeclared or owned by a plugin not
depended on, a bad route path, and config failing its schema.

At runtime: an undeclared or foreign event, a payload failing its schema, a
command without its permission, a bad registry entry.
