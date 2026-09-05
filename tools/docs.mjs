#!/usr/bin/env node
//
// Every contract document stays within 1800 characters, and every plugin has
// one. Run from the repository root.

import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";

const limit = 1800;
let failed = 0;

function check(path, allowed = limit)
{
    if (!existsSync(path))
    {
        console.log(`MISSING ${path}`);
        failed = 1;
        return;
    }

    const size = readFileSync(path, "utf8").length;

    if (size > allowed)
    {
        console.log(`OVER  ${path.padEnd(52)} ${String(size).padStart(5)}`);
        failed = 1;
        return;
    }

    console.log(`ok    ${path.padEnd(52)} ${String(size).padStart(5)}`);
}

for (const entry of readdirSync("#docs/procedures"))
{
    check(join("#docs/procedures", entry));
}

check("README.md");
check("#docs/architecture.md");

// A procedure is read, so it fits a screen. A reference is searched, and
// split across files it answers the wrong one half the time.
check("#docs/reference.md", 5600);
check("src/kernel/usage.md");

for (const name of readdirSync("src/plugins"))
{
    if (statSync(join("src/plugins", name)).isDirectory())
    {
        check(join("src/plugins", name, "usage.md"));
    }
}

process.exit(failed);
