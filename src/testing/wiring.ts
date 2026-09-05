import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, relative } from "node:path";

export type Unread = {
    file: string;
    shape: string;
    field: string;
};

export function wiring(root: string): Unread[]
{
    const sources = walk(root).map((file): [string, string] => [file, readFileSync(file, "utf8")]);
    const unread: Unread[] = [];

    for (const [file, source] of sources)
    {
        for (const { shape, field } of declared(source))
        {
            if (!reads(field, sources, file))
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

    const found: string[] = [];

    for (const entry of readdirSync(path))
    {
        const full = join(path, entry);

        if (statSync(full).isDirectory())
        {
            found.push(...walk(full));
            continue;
        }

        if (/\.tsx?$/.test(entry))
        {
            found.push(full);
        }
    }

    return found;
}

// A contract is what crosses a boundary, so only exported shapes count: an
// internal type is read by whoever wrote it or it would not compile.
function declared(source: string): { shape: string; field: string }[]
{
    const found: { shape: string; field: string }[] = [];

    for (const shape of source.matchAll(/export\s+(?:type\s+(\w+)\s*=\s*\{|interface\s+(\w+)[^{]*\{)/g))
    {
        const name = shape[1] ?? shape[2] ?? "";
        const from = (shape.index ?? 0) + shape[0].length;
        const body = withoutParameters(source.slice(from, closes(source, from)));

        for (const field of body.matchAll(/(?:^|[;,{\n])\s*(?:readonly\s+)?(\w+)\s*\??\s*:/g))
        {
            found.push({ shape: name, field: field[1] ?? "" });
        }
    }

    return found;
}

// Where the brace opened at `from` closes. Walking counts nested shapes as
// part of the same contract; stopping at the first "}" would miss their fields.
function closes(source: string, from: number): number
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

// A parameter inside a function type is not a field: `debug: (line, about?: X)
// => void` declares one name, and "about" is positional. Counting it reports a
// defect where there is none.
function withoutParameters(body: string): string
{
    let out = "";
    let depth = 0;

    for (const character of body)
    {
        if (character === "(")
        {
            depth += 1;
        }

        if (depth === 0)
        {
            out += character;
        }

        if (character === ")")
        {
            depth = Math.max(0, depth - 1);
        }
    }

    return out;
}

// Property access, destructuring, an object literal built from it, a string
// key. A name in none of those is a name nothing consumes.
function reads(field: string, sources: readonly [string, string][], where: string): boolean
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

// The declaration itself is not a read. Shapes are stripped by walking braces,
// never by matching to the next "}": a regex doing that runs past the end of
// the type and swallows the code below it.
function withoutShapes(source: string): string
{
    let out = "";
    let at = 0;

    for (const shape of source.matchAll(/export\s+(?:type\s+\w+\s*=\s*|interface\s+\w+[^{]*)\{/g))
    {
        const from = (shape.index ?? 0) + shape[0].length;

        out += source.slice(at, shape.index);
        at = closes(source, from) + 1;
    }

    return out + source.slice(at);
}
