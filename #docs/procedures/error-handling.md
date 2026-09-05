# Procedure: error handling

Our code runs inside someone else's application, so every failure names what we
rejected.

One error class per package, declared in the entry, matched by callers:
`KernelFault`, `TransportFault`. Each carries a `code` and sets `name`. `code`
is a closed union, not a string: a new member is a compile error wherever it is
handled exhaustively. Never throw a bare `Error`, a string or an object
literal: a caller cannot match those.

## Messages

What was rejected and what was expected:

```
plugin "billing" declares event "session.ended", which belongs to "session"
```

Not `invalid event`. A message about a number carries it; one about a name
quotes it, so an empty string is visible.

No internal path, no config value, no header, no token, no request body ever
reaches a message. A `TransportFault` names the method and path it was given,
never what it sent.

## Where we throw

Validation throws: a contract that does not hold is a programming error.

Runtime does not, unless the application asked. A listener that fails is
caught, logged and recorded where the application can read it.

Wrap a cause, never replace it: `cause` must survive to the top.

## Refuses

- Throwing anything but a package error class.
- A message without the name or number that failed.
- An internal path, a config value or a credential in a message.
- Swallowing a failure with nowhere to read it.
