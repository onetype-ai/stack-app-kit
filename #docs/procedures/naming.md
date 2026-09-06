# Procedure: naming

A name says what the thing **is**, in the plainest word that fits. Not what
happened to it, not the pattern it implements.

A name is a part of speech, not a suffix. Put **the** in front and see if you
get a thing, or **is** and see if you get a state. A word that only fits after
**currently** is a verb doing a noun's job: `the encoding` and `is pending`
are names, `currently hearing` is not.

```
Registry    not Manager, Store, Holder
Contract    not Config, Meta, Descriptor
Slot        not SlotComponent, SlotWrapper
```

**Types** are specific nouns: `Plugin`, `Kernel`, `Route`, `Subscription`.
Never `Manager`, `Handler`, `Helper`, `Util`, `Service`, `Data`, `Info`: a type
resisting a concrete noun does more than one thing. No `I` prefix, no `Type`
suffix.

**Functions** are imperative verbs: `start`, `validate`, `subscribe`, `emit`.
One returning a value is named for the value, without `get`: `failures()`, not
`getFailures()`. A predicate reads as a question: `granted()`. A factory is
`create<Thing>`, one per capability.

**Components** are nouns in PascalCase: `Slot`, `RouteGuard`,
`KernelProvider`. A hook is `use<Thing>` and returns the thing:
`usePlugin("billing")` returns that plugin's context. Not `usePluginData`, not
`useGetPlugin`.

**Variables** take the word for what they hold: `plugin`, `route`, `left`.
Loop variables take the singular of what they walk. Never `data`, `res`,
`tmp`, `obj`, `val`, `item`, `x`.

**Files** in `internal/` are named for their subject, singular: `registry.ts`,
`socket.ts`. A file holding every type is a file with no subject.

## Refuses

- A pattern name where a concrete noun exists.
- `get` on a reader, `I` on an interface, `Type` on a type.
- `types.ts`, `utils.ts`, `helpers.ts`, `common.ts`.
