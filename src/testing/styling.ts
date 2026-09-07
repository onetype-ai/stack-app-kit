import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

export type UnknownToken = {
    file: string;
    token: string;
};

type Asked = UnknownToken & { at: string };

export type Literal = {
    file: string;
    line: number;
    kind: "colour" | "length" | "duration";
    holds: string;
};

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

        const source = readFileSync(file, "utf8");

        // The module a component imports, not the one beside it: a component
        // may reach for a stylesheet in another folder, and a check reading
        // the name alone never opens the file it actually uses.
        const imported = /from\s+["']([^"']+\.module\.css)["']/.exec(source)?.[1];
        const module = imported === undefined
            ? file.replace(/\.tsx$/, ".module.css")
            : join(file, "..", imported);

        if (!existsSync(module))
        {
            continue;
        }

        const declared = new Set([...readFileSync(module, "utf8").matchAll(/\.([a-zA-Z][\w-]*)/g)].map((match) => match[1]!));

        for (const match of source.matchAll(/\bstyles\.([a-zA-Z][\w]*)/g))
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


const DECLARING = ["tokens.css", "reset.css"];

const BREAKPOINT = /^\s*@(media|container)\b/;

const COLOUR = /#[0-9a-fA-F]{3,8}\b|\brgba?\s*\(|\bhsla?\s*\(|\boklch\s*\(/;

const LENGTH = /(?<![\w.#-])\d*\.?\d+(px|rem|em)\b/;

const DURATION = /(?<![\w.#-])\d*\.?\d+m?s\b/;

const NOTHING_OR_HAIRLINE = /^(0|1px)$/;

/**
 * Every raw colour, length and duration written outside the sheets that
 * declare them.
 *
 * A value written twice drifts: one rule says 12px and the next says 0.75rem,
 * and nothing renders wrongly enough for anyone to look. A token names the
 * decision once, so changing it changes every rule that took it.
 * */
export function findLiterals(root: string): Literal[]
{
    const found: Literal[] = [];

    for (const file of walk(root))
    {
        if (!file.endsWith(".css") || DECLARING.some((named) => file.endsWith(named)))
        {
            continue;
        }

        const lines = readFileSync(file, "utf8").split("\n");

        for (let at = 0; at < lines.length; at += 1)
        {
            const raw = lines[at] ?? "";

            if (BREAKPOINT.test(raw))
            {
                continue;
            }

            const where = { file: relative(root, file), line: at + 1, holds: raw.trim() };

            if (COLOUR.test(raw))
            {
                found.push({ ...where, kind: "colour" });
            }

            const measured = LENGTH.exec(raw);

            if (measured !== null && !NOTHING_OR_HAIRLINE.test(measured[0]))
            {
                found.push({ ...where, kind: "length" });
            }

            if (DURATION.test(raw))
            {
                found.push({ ...where, kind: "duration" });
            }
        }
    }

    return found;
}
