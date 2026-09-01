# kernel

## Description

The plugin runtime an application builds on: registry, contract validation,
events, hooks, slots, permissions.

## Purpose

A front-end grows into one thing unless something holds the seams. A plugin
declares what crosses its boundary and the kernel refuses the rest, so a
feature is added and removed in one folder.

## Usage

```ts
export default definePlugin("auth", {
    version: "1.0.0",
    describe: "Owns the session every other plugin checks against.",
    dependsOn: ["transport"],
    config: AuthConfig,
    services: (ctx) => ({ session: session(ctx) }),
    emits: { "auth.signed-out": { describe: "Session ended.", schema } },
    setup: (ctx) => ctx.log.info("auth ready"),
});
```

```ts
const kernel = createKernel({ plugins: [auth, billing], config, http, permissions });

await kernel.start();
```

`start` validates everything first and throws naming every problem at once.
Nothing partially starts.

```tsx
<KernelProvider kernel={kernel}>
    <Slot name="notes.actions" payload={{ noteId }} />
    <RouteGuard route={route} />
</KernelProvider>
```

`Slot` renders contributions in `order`, hides what the viewer may not see,
passes each the validated payload, and wraps each in its own boundary.
`usePlugin("auth")` returns its context; `ctx.use("auth")` does so outside a
component.

## Refuses

At startup: a duplicate plugin, an unknown or cyclic dependency, a name
outside the plugin's namespace, a duplicate route, slot, event, hook, command
or permission, a reference to anything undeclared or owned by a plugin this
one does not depend on, a bad route path, and config failing its schema.

At runtime: an undeclared event or one owned by another plugin, a payload
failing its schema, a command run without its permission.
