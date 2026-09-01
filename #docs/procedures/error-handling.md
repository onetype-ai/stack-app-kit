# Procedure: error handling

Our code runs inside someone else's application: what we throw lands in their
console, so every failure names what we rejected.

## Error classes

One class per package, declared in the entry, matched by callers:
`KernelError`, `TransportError`. Each carries a `code` and sets `name`.

`code` is a closed union, not a string: a caller branches on it, and a new
member is a compile error wherever it is handled exhaustively.

Never throw a bare `Error`, a string or an object literal: a caller cannot
match those, so they become "something went wrong" in someone else's UI.

## Messages

What was rejected and what was expected:

```
plugin "billing" declares event "session.ended", which belongs to "session"
```

Not `invalid event`: the name that failed and the rule it broke, both in the
line, because we are not there when it fails. A message about a number carries
it; one about a name quotes it, so an empty string is visible.

No internal path, no config value, no header, no token, no request body ever
reaches a message. A `TransportError` names the method and path it was given,
never what it sent.

## Where we throw

Validation throws: a contract that does not hold is a programming error, and
it must be loud.

Runtime does not, unless the application asked. A listener that fails is
caught, logged and recorded, where the application can read it: one plugin's
bug is not the kernel's failure.

Wrap a cause, never replace it — `cause` must survive to the top.

## Refuses

- Throwing anything but a package error class.
- A message without the name or number that failed.
- An internal path, a config value or a credential in a message.
- Swallowing a failure with nowhere to read it.
