import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

export type UnknownToken = {
    file: string;
    token: string;
};

type Asked = UnknownToken & { at: string };

export type UnknownClass = {
    file: string;
    name: string;
};

/**
 * Every `var(--name)` a stylesheet asks for that nothing declares.
 *
 * CSS answers an undeclared token with nothing and applies the rule as if it
 * were not written, so a stylesheet against the wrong names builds green and
 * changes no pixel. Types cannot see it and neither can a render test.
 *
 * A module's own token is answered in its own file, and a component may hand
 * one in through `style`. One module's token never reaches another.
 */
export function findUnknownTokens(root: string): UnknownToken[]
{
    const files = walk(root);
    const anywhere = new Set<string>();
    const inside = new Map<string, Set<string>>();
    const used: Asked[] = [];

    for (const file of files)
    {
        const source = readFileSync(file, "utf8");

        if (file.endsWith(".css"))
        {
            // A module's own token lives on its own root, so a second module
            // asking for it gets nothing: it reaches the element only where
            // that element is inside the first one.
            const reach = file.endsWith(".module.css")
                ? (inside.get(file) ?? new Set<string>())
                : anywhere;

            for (const match of source.matchAll(/(?:^|[{;])\s*(--[a-z0-9-]+)\s*:\s*[^\s;][^;]*/gm))
            {
                reach.add(match[1] ?? "");
            }

            if (reach !== anywhere)
            {
                inside.set(file, reach);
            }

            for (const match of source.matchAll(/var\((--[a-z0-9-]+)/g))
            {
                used.push({ at: file, file: relative(root, file), token: match[1] ?? "" });
            }

            continue;
        }

        for (const match of source.matchAll(/["'](--[a-z0-9-]+)["']\s*:/g))
        {
            anywhere.add(match[1] ?? "");
        }
    }

    return used
        .filter((one) => !anywhere.has(one.token) && inside.get(one.at)?.has(one.token) !== true)
        .map((one) => ({ file: one.file, token: one.token }));
}

/**
 * Every `styles.name` a component reads that its own module never declares.
 *
 * A CSS module answers an unknown name with undefined, and React drops an
 * undefined className without a word: the element renders unstyled and every
 * test still passes. Types cannot see it either, because the module is typed
 * as a record of strings.
 */
export function findUnknownClasses(root: string): UnknownClass[]
{
    const wrong: UnknownClass[] = [];

    for (const file of walk(root))
    {
        if (!file.endsWith(".tsx"))
        {
            continue;
        }

        const module = file.replace(/\.tsx$/, ".module.css");

        if (!existsSync(module))
        {
            continue;
        }

        const declared = new Set([...readFileSync(module, "utf8").matchAll(/\.([a-zA-Z][\w-]*)/g)].map((match) => match[1]!));

        for (const match of readFileSync(file, "utf8").matchAll(/\bstyles\.([a-zA-Z][\w]*)/g))
        {
            const name = match[1]!;

            if (!declared.has(name))
            {
                wrong.push({ file: relative(root, file), name });
            }
        }
    }

    return wrong;
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
