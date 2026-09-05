# Procedure: validation

Everything crossing into a package is checked where it enters.

## Two inputs

The application sends plugins, options and config: wrong, never hostile. The
server sends responses and messages: untrusted. Both are validated, and so is
one of our own plugins: the kernel treats every contract alike. They differ in
what a failure means: the application gets a thrown error naming its mistake,
the server a rejected response.

## The application

Validated once, at `start`, before anything runs. Everything, then a report: an
application with four mistakes should learn all four in one run.

`start` brings up every plugin or throws. Nothing partially starts: a
half-started kernel behaves according to where it stopped.

Check what the type system cannot: names against a pattern, references against
what exists, cycles, duplicates, namespaces. TypeScript is erased at runtime,
and the application may not even be TypeScript.

## The server

A response body is `unknown` until something checks it. Parse at the boundary,
never cast: a response that changed shape becomes `undefined` three files later
with the stack pointing at us.

We return `unknown` rather than validating for the caller: we do not own their
shapes. What we own is our envelope and our error bodies: we reject as
`MALFORMED`.

Anything the other side controls is bounded before it is held: response size,
message size, queue depth, retry count, backoff ceiling.

## Refuses

- `as` on anything that crossed a boundary, or `any` where `unknown` would do.
- Validating at use rather than at entry.
- Stopping at the first failure when the rest could be reported too.
- A limit the other side sets.
