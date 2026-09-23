# locale

## Description

One tag from what a viewer accepts, and each plugin's text in it:
`negotiate` here, `messages` and `ctx.locale` in the kernel.

## Purpose

The api and the app answer the same tag for the same viewer: both kits ship
this function and run one case table. A plugin's text lives beside its code
and fails at start when the fallback lacks a key, never on a screen.

## Usage

```ts
const current = locale.negotiate(navigator.languages, ["en", "de"], "en", stored);
await start({ plugins, transport, locale: { supported: ["en", "de"], fallback: "en", current } });

// a plugin
messages: {
    en: { empty: "No items yet", count: { one: "{count} item", other: "{count} items" } },
    de: { empty: "Noch keine Einträge", count: { one: "{count} Eintrag", other: "{count} Einträge" } },
},
ctx.locale.text("count", { count: 3 });   // "3 Einträge"
ctx.locale.format.number(1234.5);        // "1.234,5"
const locale = useLocale("items");       // re-renders on change
```

- `negotiate`: a supported stored choice wins; then each accepted tag in
  order (q-values, ties by position, `*` and `q=0` ignored): exact, then by
  language (`de-AT` → `de`, `de` → the first `de-*`); then `fallback`.
- `text` reads the current locale, then the fallback, then the key itself.
- `change(tag)` reaches every plugin and every `watch`.
- Server pages: `handle` forwards `accept-language`; negotiate the same way.

## Refuses

A fallback outside `supported`; messages in an unsupported locale or with a
key the fallback lacks (at start, all at once); `change` to an unsupported
tag.
