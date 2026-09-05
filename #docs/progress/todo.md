# todo

1. **An eslint config**: `check.sh` no longer calls it, because calling an
   unconfigured tool is the same as checking nothing. Prettier is gone for
   good: it cannot write Allman braces and says it never will
2. **Run it in a browser, every time**: one pass was done. Routes render, the
   guard refuses naming the permission it wanted, and the tokens reach the
   page. It also showed that no unit has a style yet, which vitest cannot see
3. **A worked example that does something**: the application boots its own
   plugins in a test now, but the demo is still one plugin with no styling
4. **A socket nobody opened is a state, not a fault**: `channel()` answers
   `http` and `subscribe` delivers nothing. Tested, and easy to "fix" wrongly
5. **A refused start reaches no screen**: `start` throws a message naming the
   plugin, the key and the fix, and an application that does not catch it
   renders white. The best text in the kit reached nobody last time
6. **State that outlives a route**: a flow spanning routes unmounts each page,
   and nothing here says where that state lives
7. **URL state**: a route declares no search parameters, in a kit whose rule
   is that undeclared means it does not exist
8. **Guards that depend on data**: a route guard expresses permissions only,
   so anything else becomes a redirect that flashes the wrong screen first
