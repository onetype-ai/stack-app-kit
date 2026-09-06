import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

export type UnknownToken = {
    file: string;
    token: string;
};

/**
 * Every `var(--name)` a stylesheet asks for that nothing declares.
 *
 * CSS answers an undeclared token with nothing and applies the rule as if it
 * were not written, so a stylesheet against the wrong names builds green and
 * changes no pixel. Types cannot see it and neither can a render test.
 *
 * A file may declare its own, and a component may hand one in through
 * `style`, so anything set anywhere under the root is answered.
 */
export function findUnknownTokens(root: string): UnknownToken[]
{
    const files = walk(root);
    const set = new Set<string>();
    const asked: UnknownToken[] = [];

    for (const file of files)
    {
        const source = readFileSync(file, "utf8");

        if (file.endsWith(".css"))
        {
            for (const match of source.matchAll(/(?:^|[{;])\s*(--[a-z0-9-]+)\s*:/gm))
            {
                set.add(match[1] ?? "");
            }

            for (const match of source.matchAll(/var\((--[a-z0-9-]+)/g))
            {
                asked.push({ file: relative(root, file), token: match[1] ?? "" });
            }

            continue;
        }

        // A component setting one through `style={{ "--seed": … }}`.
        for (const match of source.matchAll(/["'](--[a-z0-9-]+)["']\s*:/g))
        {
            set.add(match[1] ?? "");
        }
    }

    return asked.filter((used) => !set.has(used.token));
}

function walk(at: string): string[]
{
    const files: string[] = [];

    for (const entry of readdirSync(at))
    {
        const path = join(at, entry);

        if (statSync(path).isDirectory())
        {
            if (entry !== "node_modules" && entry !== "dist")
            {
                files.push(...walk(path));
            }

            continue;
        }

        if (path.endsWith(".css") || path.endsWith(".tsx") || path.endsWith(".ts"))
        {
            files.push(path);
        }
    }

    return files;
}
