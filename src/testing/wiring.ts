import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, relative } from "node:path";

export type UnusedField = {
    file: string;
    shape: string;
    field: string;
};

export function findUnusedFields(root: string): UnusedField[]
{
    const sources = walk(root).map((file): [string, string] => [file, readFileSync(file, "utf8")]);
    const unread: UnusedField[] = [];

    for (const [file, source] of sources)
    {
        for (const { shape, field } of declared(source))
        {
            if (!isRead(field, sources, file))
            {
                unread.push({ file: relative(root, file), shape, field });
            }
        }
    }

    return unread;
}

function walk(path: string): string[]
{
    if (!existsSync(path))
    {
        return [];
    }

    const files: string[] = [];

    for (const entry of readdirSync(path))
    {
        const full = join(path, entry);

        if (statSync(full).isDirectory())
        {
            files.push(...walk(full));
            continue;
        }

        if (/\.tsx?$/.test(entry))
        {
            files.push(full);
        }
    }

    return files;
}

function declared(source: string): { shape: string; field: string }[]
{
    const fields: { shape: string; field: string }[] = [];

    for (const shape of source.matchAll(/export\s+(?:type\s+(\w+)\s*=\s*\{|interface\s+(\w+)[^{]*\{)/g))
    {
        const name = shape[1] ?? shape[2] ?? "";
        const from = (shape.index ?? 0) + shape[0].length;
        const body = withoutParameters(source.slice(from, closingBrace(source, from)));

        for (const field of body.matchAll(/(?:^|[;,{\n])\s*(?:readonly\s+)?(\w+)\s*\??\s*:/g))
        {
            fields.push({ shape: name, field: field[1] ?? "" });
        }
    }

    return fields;
}

function closingBrace(source: string, from: number): number
{
    let depth = 1;
    let at = from;

    while (at < source.length && depth > 0)
    {
        if (source[at] === "{")
        {
            depth += 1;
        }

        if (source[at] === "}")
        {
            depth -= 1;
        }

        at += 1;
    }

    return at - 1;
}

function withoutParameters(body: string): string
{
    let outside = "";
    let depth = 0;

    for (const character of body)
    {
        if (character === "(")
        {
            depth += 1;
        }

        if (depth === 0)
        {
            outside += character;
        }

        if (character === ")")
        {
            depth = Math.max(0, depth - 1);
        }
    }

    return outside;
}

function isRead(field: string, sources: readonly [string, string][], where: string): boolean
{
    const patterns = [
        new RegExp(`\\.${field}\\b`),
        new RegExp(`\\b${field}\\s*[,}]`),
        new RegExp(`\\b${field}\\s*:`),
        new RegExp(`\\b${field}\\s*=[^=]`),
        new RegExp(`\\[["']${field}["']\\]`),
        new RegExp(`["']${field}["']`),
    ];

    return sources.some(([file, source]) =>
    {
        const searched = file === where ? withoutShapes(source) : source;

        return patterns.some((pattern) => pattern.test(searched));
    });
}

function withoutShapes(source: string): string
{
    let body = "";
    let at = 0;

    for (const shape of source.matchAll(/export\s+(?:type\s+\w+\s*=\s*|interface\s+\w+[^{]*)\{/g))
    {
        const from = (shape.index ?? 0) + shape[0].length;

        body += source.slice(at, shape.index);
        at = closingBrace(source, from) + 1;
    }

    return body + source.slice(at);
}

export type Unwatched = {
    file: string;
    shape: string;
};

export type DanglingPath = {
    alias: string;
    target: string;

    /** Which map declared it, since a project keeps more than one. */
    file: string;
};

/**
 * Aliases whose target is not on disk, in every file that declares one.
 *
 * One nobody imports yet resolves to nothing and says so to nobody: the
 * compiler only speaks when a file asks for it, so an alias written ahead of
 * the code it points at looks wired until somebody tries the first import.
 *
 * Both maps are read rather than one. A project keeps the same aliases twice,
 * once for the compiler and once for the bundler, and those two disagreeing is
 * the same defect wearing a different coat: one measured case had `@ui`
 * resolving to a file nobody had written, in both, with `@ui/styles/*`
 * resolving separately and working, so nothing looked wrong.
 *
 * A trailing `*` names a folder and is checked as one, because an alias
 * pointing a whole layer at a directory that does not exist fails exactly as
 * loudly and exactly as late. An empty folder is still a folder: a layer with
 * nothing in it yet is not a broken alias.
 *
 * A vite config is read as text, never evaluated: it is a module that computes
 * its own paths, and running one to read it would run whatever else it does.
 * Its pattern says which shape an entry is — one anchored with `$` names a
 * file, one ending in an escaped slash a folder — because the replacement
 * cannot, a folder's trailing slash being written outside the quotes. A map
 * written some other way is skipped rather than guessed at.
 */
export function findDanglingPaths(root: string, files: readonly string[] = ["tsconfig.json", "vite.config.ts"]): DanglingPath[]
{
    const found: DanglingPath[] = [];

    for (const name of files)
    {
        const config = join(root, name);

        if (!existsSync(config))
        {
            continue;
        }

        const source = readFileSync(config, "utf8");

        for (const [alias, targets] of name.endsWith(".json") ? readPaths(source) : readAliases(source))
        {
            for (const target of targets)
            {
                const folder = /[/*]$/.test(target) || alias.endsWith("*");
                const at = join(root, target.replace(/\/?\*?$/, ""));

                if (existsSync(at) && (folder ? statSync(at).isDirectory() : statSync(at).isFile()))
                {
                    continue;
                }

                found.push({ alias, target, file: name });
            }
        }
    }

    return found;
}

function readAliases(source: string): Map<string, string[]>
{
    const found = new Map<string, string[]>();

    for (const match of source.matchAll(/find:\s*\/\^(@[a-zA-Z0-9_-]+)(\$|\\\/)\/[^,]*,\s*replacement:[^"]*"\.\/([^"]+)"/g))
    {
        const folder = match[2] !== "$";

        found.set(folder ? `${match[1]!}/*` : match[1]!, [folder ? `${match[3]!}/*` : match[3]!]);
    }

    return found;
}

function readPaths(source: string): Map<string, string[]> 
{
    const at = source.indexOf('"paths"');
    const block = at === -1 ? "" : source.slice(at, closingOf(source, at));
    const found = new Map<string, string[]>();

    for (const entry of block.matchAll(/"([^"]+)"\s*:\s*\[([^\]]*)\]/g))
    {
        const targets = [...(entry[2] ?? "").matchAll(/"([^"]+)"/g)].map((one) => one[1] ?? "");

        found.set(entry[1] ?? "", targets);
    }

    return found;
}

function closingOf(source: string, at: string | number): number
{
    let depth = 0;

    for (let index = Number(at); index < source.length; index += 1)
    {
        if (source[index] === "{")
        {
            depth += 1;
        }

        if (source[index] === "}")
        {
            depth -= 1;

            if (depth === 0)
            {
                return index;
            }
        }
    }

    return source.length;
}

export function findUnwatched(root: string): Unwatched[]
{
    const found: Unwatched[] = [];

    for (const file of walk(root))
    {
        const source = readFileSync(file, "utf8");

        for (const shape of source.matchAll(/^(?:type\s+(\w+)\s*=\s*\{|interface\s+(\w+)[^{]*\{)/gm))
        {
            found.push({ file: relative(root, file), shape: shape[1] ?? shape[2] ?? "" });
        }
    }

    return found;
}
