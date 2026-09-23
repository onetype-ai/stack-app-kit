#!/usr/bin/env node
//
// The kit's command line. `new plugin <name>` writes a plugin in the layout an
// application's #docs describe: plugin.ts, index.ts, usage.md and one test that
// the plugin starts. It writes nothing outside the new folder, and refuses a
// name that is not a plugin name or a folder that already exists.

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

const [command, kind, name, ...rest] = process.argv.slice(2);
const at = rest.indexOf("--plugins");
const plugins = at === -1 ? join(process.cwd(), "src", "plugins") : rest[at + 1] ?? "";

function refuse(message)
{
    console.error(`stack-app-kit: ${message}`);
    process.exit(1);
}

if (command !== "new" || kind !== "plugin")
{
    refuse("usage: stack-app-kit new plugin <name> [--plugins <folder>]");
}

if (name === undefined || !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(name))
{
    refuse(`"${name ?? ""}" is not a plugin name. Use lowercase letters, digits and single hyphens, starting with a letter: items, order-history.`);
}

const folder = join(plugins, name);

if (existsSync(folder))
{
    refuse(`${relative(process.cwd(), folder)} already exists. Pick another name, or edit that plugin.`);
}

const words = name.split("-");
const pascal = words.map((word) => word[0].toUpperCase() + word.slice(1)).join("");
const camel = pascal[0].toLowerCase() + pascal.slice(1);

const files = {
    "plugin.ts": `import { definePlugin } from "@onetype/stack-app-kit";

export default definePlugin("${name}", {
    version: "1.0.0",
    describe: "TODO: one sentence saying what ${name} is for.",
});
`,
    "index.ts": `export const ${pascal} = {};
`,
    "usage.md": `# ${name}

## Description

TODO: what this plugin holds, in one or two sentences.

## Purpose

TODO: why it is its own plugin: what would go wrong without it.

## Usage

\`\`\`ts
TODO: the one call another plugin makes, through index.ts.
\`\`\`

## Refuses

- TODO: every refusal, each with a test that triggers it.
`,
    [`tests/${camel}.test.ts`]: `import { createKernel } from "@onetype/stack-app-kit";
import { expect, test } from "vitest";

import ${camel} from "../plugin";

test("${name} starts on its own contract", async () =>
{
    const kernel = createKernel({ plugins: [${camel}] });

    await kernel.start();

    expect(kernel.started()).toBe(true);
});
`,
};

mkdirSync(join(folder, "tests"), { recursive: true });

for (const [file, contents] of Object.entries(files))
{
    writeFileSync(join(folder, file), contents);
    console.log(`wrote ${relative(process.cwd(), join(folder, file))}`);
}

console.log(`Fill every TODO: Project.findWarnings() lists the ones left.`);
