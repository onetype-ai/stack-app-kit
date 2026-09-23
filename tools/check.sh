#!/usr/bin/env bash
#
# Everything CI runs. One command, so the same checks pass locally.

set -uo pipefail

failed=0

step()
{
    printf '\n== %s\n' "$1"
    shift

    if ! "$@"
    then
        failed=1
    fi
}

step "types" npx tsc --noEmit
step "lint" npx eslint src
step "build" sh -c "npx tsup && npx tsup --config tsup.e2e.config.ts && npx tsup --config tsup.testing-app.config.ts"
step "test" npx vitest run
step "docs" node tools/docs.mjs
step "schema" node bin/schemas.mjs --check
step "boundaries" node tools/boundaries.mjs

if [ "$failed" -ne 0 ]
then
    printf '\nFAILED\n'
    exit 1
fi

printf '\nall checks pass\n'
