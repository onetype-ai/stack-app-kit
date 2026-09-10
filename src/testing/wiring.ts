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
    let cursor = from;

    while (cursor < source.length && depth > 0)
    {
        if (source[cursor] === "{")
        {
            depth += 1;
        }

        if (source[cursor] === "}")
        {
            depth -= 1;
        }

        cursor += 1;
    }

    return cursor - 1;
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
    let cursor = 0;

    for (const shape of source.matchAll(/export\s+(?:type\s+\w+\s*=\s*|interface\s+\w+[^{]*)\{/g))
    {
        const from = (shape.index ?? 0) + shape[0].length;

        body += source.slice(cursor, shape.index);
        cursor = closingBrace(source, from) + 1;
    }

    return body + source.slice(cursor);
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

/** Aliases whose target is not on disk, in every file that declares one. */
export function findDanglingPaths(root: string, files: readonly string[] = ["tsconfig.json", "vite.config.ts"]): DanglingPath[]
{
    const dangling: DanglingPath[] = [];

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
                const path = join(root, target.replace(/\/?\*?$/, ""));

                if (existsSync(path) && (folder ? statSync(path).isDirectory() : statSync(path).isFile()))
                {
                    continue;
                }

                if (packedAway(root, target.replace(/^\.?\//, "")))
                {
                    continue;
                }

                dangling.push({ alias, target, file: name });
            }
        }
    }

    return dangling;
}

function readAliases(source: string): Map<string, string[]>
{
    const byAlias = new Map<string, string[]>();

    for (const match of source.matchAll(/find:\s*\/\^(@[a-zA-Z0-9_-]+)(\$|\\\/)\/[^,]*,\s*replacement:[^"]*"\.\/([^"]+)"/g))
    {
        const folder = match[2] !== "$";

        byAlias.set(folder ? `${match[1]!}/*` : match[1]!, [folder ? `${match[3]!}/*` : match[3]!]);
    }

    return byAlias;
}

function readPaths(source: string): Map<string, string[]> 
{
    const opens = source.indexOf('"paths"');
    const block = opens === -1 ? "" : source.slice(opens, closingOf(source, opens));
    const byAlias = new Map<string, string[]>();

    for (const entry of block.matchAll(/"([^"]+)"\s*:\s*\[([^\]]*)\]/g))
    {
        const targets = [...(entry[2] ?? "").matchAll(/"([^"]+)"/g)].map((one) => one[1] ?? "");

        byAlias.set(entry[1] ?? "", targets);
    }

    return byAlias;
}

function closingOf(source: string, from: string | number): number
{
    let depth = 0;

    for (let index = Number(from); index < source.length; index += 1)
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
    const unwatched: Unwatched[] = [];

    for (const file of walk(root))
    {
        const source = readFileSync(file, "utf8");

        for (const shape of source.matchAll(/^(?:type\s+(\w+)\s*=\s*\{|interface\s+(\w+)[^{]*\{)/gm))
        {
            unwatched.push({ file: relative(root, file), shape: shape[1] ?? shape[2] ?? "" });
        }
    }

    return unwatched;
}

function packedAway(root: string, target: string): boolean
{
    for (const entry of readdirSync(root, { withFileTypes: true, recursive: true }))
    {
        if (!entry.isFile() || entry.name !== "example.txt")
        {
            continue;
        }

        if (readFileSync(join(entry.parentPath, entry.name), "utf8").includes(`==> ${target}`))
        {
            return true;
        }
    }

    return false;
}
