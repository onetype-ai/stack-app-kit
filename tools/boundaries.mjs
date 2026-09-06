#!/usr/bin/env node
//
// The rules the compiler cannot enforce. Run from the repository root.
//
//   1. The kernel names no plugin.
//   2. A plugin imports another only through its api.ts, and only what it
//      declared in needs.
//   3. Plugin names appear outside their own folder in exactly one file.
//   4. Every plugin has the structure #docs/procedures/plugin-structure.md
//      describes.
//   5. The pure entry reaches no React and no DOM.
//   6. internal/ never imports an entry, and exports carries no wildcard.

import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";

const root = "src/plugins";
const entry = "src/index.ts";
let failed = 0;

function fault(message)
{
    console.log(`BOUNDARY  ${message}`);
    failed = 1;
}

// walk lists every source file under a directory.
function walk(path)
{
    if (!existsSync(path))
    {
        return [];
    }

    const found = [];

    for (const name of readdirSync(path))
    {
        const full = join(path, name);

        if (statSync(full).isDirectory())
        {
            found.push(...walk(full));
            continue;
        }

        if (/\.tsx?$/.test(name))
        {
            found.push(full);
        }
    }

    return found;
}

// imports lists what one file imports, and whether the import survives to
// runtime.
//
// A type import is erased: `import type { ComponentType } from "react"` adds
// no dependency, reaches no DOM, and creates no cycle. Treating it as a value
// import is a check stronger than its rule, which refuses correct code and
// teaches everyone to work around the tool.
function imports(source)
{
    const found = [];
    const patterns = [
        /(?:^|\s)(import|export)(\s+type)?\s[^;]*?from\s+["']([^"']+)["']/g,
        /\b(import)()\s*\(\s*["']([^"']+)["']\s*\)/g,
        /(?:^|\s)(import)()\s+["']([^"']+)["']/g,
    ];

    for (const pattern of patterns)
    {
        for (const match of source.matchAll(pattern))
        {
            const whole = match[0];
            const path = match[3];

            // `import type {...}` and `import { type X }` are both erased.
            const erased = match[2] !== undefined && match[2].trim() === "type"
                ? true
                : /\{[^}]*\}/.test(whole) && /\{\s*type\s/.test(whole) && !/\{[^}]*,\s*[A-Za-z_$]/.test(whole.replace(/type\s+\w+/g, ""));

            found.push({ path, erased });
        }
    }

    return found;
}

/** Just the specifiers, for a rule that does not care how they are imported. */
function paths(source)
{
    return imports(source).map((each) => each.path);
}

const plugins = existsSync(root)
    ? readdirSync(root).filter((name) => statSync(join(root, name)).isDirectory())
    : [];

// 1. The kernel must not name any plugin.
for (const file of walk("src/kernel"))
{
    const source = readFileSync(file, "utf8");

    for (const specifier of paths(source))
    {
        if (specifier.includes("plugins/"))
        {
            fault(`the kernel imports a plugin: ${relative(".", file)} -> ${specifier}`);
        }
    }
}

// 3. Plugin names appear outside their own folder in exactly one file.
//
// A sibling reaching another is rule 2's to report, with the reason it broke,
// so this one covers everything else: the kernel, the entries, and anything
// added later that is neither.
for (const name of plugins)
{
    for (const file of walk("src"))
    {
        if (file.startsWith(root) || file === entry)
        {
            continue;
        }

        if (paths(readFileSync(file, "utf8")).some((specifier) => specifier.includes(`plugins/${name}`)))
        {
            fault(`${relative(".", file)} names ${name}: only ${entry} may`);
        }
    }
}

for (const name of plugins)
{
    const path = join(root, name);

    // 4. Structure.
    for (const required of ["usage.md", "plugin.ts", "api.ts"])
    {
        if (!existsSync(join(path, required)))
        {
            fault(`${name} has no ${required}`);
        }
    }

    const tests = join(path, "tests");

    if (!existsSync(tests) || readdirSync(tests).filter((name) => name.includes(".test.")).length === 0)
    {
        fault(`${name} has no tests/, or none that hold a test`);
    }

    // Only the named files may sit at a plugin's top level.
    for (const file of readdirSync(path))
    {
        if (statSync(join(path, file)).isDirectory() || !/\.tsx?$/.test(file))
        {
            continue;
        }

        if (!["plugin.ts", "api.ts", "events.ts", "hooks.ts", "react.tsx"].includes(file))
        {
            fault(`${name}: ${file} is not one of the named top-level files`);
        }
    }

    // 2. What it declared.
    const registration = existsSync(join(path, "plugin.ts"))
        ? readFileSync(join(path, "plugin.ts"), "utf8")
        : "";

    const declared = (registration.match(/needs\s*:\s*\[([^\]]*)\]/)?.[1] ?? "")
        .split(",")
        .map((quoted) => quoted.trim().replace(/^["']|["']$/g, ""))
        .filter(Boolean);

    for (const file of walk(path))
    {
        const where = relative(".", file);
        const source = readFileSync(file, "utf8");
        const inside = file.startsWith(join(path, "internal"));
        // A .tsx file renders by definition, so it is never the pure surface.
        // Judging by path alone called a React test pure and refused it.
        const pure = !/react/.test(relative(path, file)) && !file.endsWith(".tsx");

        for (const { path: specifier, erased } of imports(source))
        {
            // 2. Another plugin, and only through api.ts.
            //
            // Resolve the specifier against the file that wrote it, so what is
            // compared is the path on disk rather than the shape someone
            // typed. "../../kernel" means our runtime from a plugin's
            // internal/ and the sibling plugin from the plugin folder, and
            // only resolving tells them apart.
            //
            // Matching the text alone let a relative path climb out of a
            // folder and reach a private file while the rule read as enforced.
            const landed = specifier.startsWith(".") ? relative(".", join(dirname(file), specifier)) : specifier;

            for (const other of plugins)
            {
                const folder = join(root, other);
                const named = landed === folder || landed.startsWith(`${folder}/`);

                if (other === name || !named)
                {
                    continue;
                }

                if (specifier.includes("/internal"))
                {
                    fault(`${where} imports ${other}'s internal`);
                }
                else if (!declared.includes(other))
                {
                    fault(`${name} imports ${other} without declaring it in needs`);
                }
            }

            // 5. The pure surface stays pure.
            //
            // A type import of React is erased and costs nothing: what must
            // not happen is a pure file reaching a React value.
            if (pure && !erased && (specifier === "react" || specifier.startsWith("react/") || specifier === "react-dom"))
            {
                fault(`${where} is pure and imports ${specifier}`);
            }

            // 6. internal/ must not climb to its own plugin's entry for a
            //    value.
            //
            // A type the entry owns has to be usable inside, or every shared
            // shape would be defined twice. A sibling's entry is rule 2's to
            // judge, and reporting it here would name the wrong rule.
            const own = landed.startsWith(`${path}/`) || landed === path;

            if (inside && own && !erased && /(^|\/)(api|plugin|react)$/.test(specifier.replace(/\.tsx?$/, "")))
            {
                fault(`${where} imports an entry from internal/`);
            }
        }

        if (pure && /\b(document|window)\s*\./.test(source))
        {
            fault(`${where} is pure and touches the DOM`);
        }
    }
}

// 6. exports lists entries only.
if (existsSync("package.json"))
{
    const manifest = JSON.parse(readFileSync("package.json", "utf8"));
    const exported = manifest.exports ?? {};

    if (Object.keys(exported).some((key) => key.includes("*")))
    {
        fault("exports carries a wildcard, which makes every internal file public");
    }

    for (const target of Object.values(exported))
    {
        const file = typeof target === "string" ? target : target?.default;

        if (typeof file === "string" && file.includes("/internal/"))
        {
            fault("exports points into internal/");
        }
    }

    if (manifest.dependencies?.react)
    {
        fault("react is a dependency, not a peer");
    }
}

// 3. Every plugin is reachable from the entry: one registered but never
//    exported is a plugin no application can pass, and nothing else says so.
if (existsSync(entry))
{
    const source = readFileSync(entry, "utf8");

    for (const name of plugins)
    {
        if (!paths(source).some((specifier) => specifier.includes(`plugins/${name}`)))
        {
            fault(`${name} is not exported from ${entry}: nothing can reach it`);
        }
    }
}

if (failed === 0)
{
    console.log("boundaries hold");
}

process.exit(failed);
