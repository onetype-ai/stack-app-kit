import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

export type Unknown = {
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
export function styling(root: string): Unknown[]
{
    const files = walk(root);
    const set = new Set<string>();
    const asked: Unknown[] = [];

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

    return asked.filter((one) => !set.has(one.token));
}

function walk(at: string): string[]
{
    const found: string[] = [];

    for (const entry of readdirSync(at))
    {
        const one = join(at, entry);

        if (statSync(one).isDirectory())
        {
            if (entry !== "node_modules" && entry !== "dist")
            {
                found.push(...walk(one));
            }

            continue;
        }

        if (one.endsWith(".css") || one.endsWith(".tsx") || one.endsWith(".ts"))
        {
            found.push(one);
        }
    }

    return found;
}
