import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/** A markdown file past the character limit, with the size it reached. */
export type OversizedDoc = {
    path: string;
    size: number;
};

/** A `Definition` key the written procedure never mentions. */
export type UndocumentedKey = {
    key: string;
};

const LIMIT = 1800;

/** Every `.md` under `root` longer than `maxCharacters` (1800 by default), skipping any path holding "progress". */
export function findOversizedDocs(root: string, maxCharacters: number = LIMIT): OversizedDoc[]
{
    if (!existsSync(root))
    {
        return [];
    }

    return readdirSync(root, { withFileTypes: true, recursive: true })
        .filter((entry) =>
        {
            return entry.isFile() && entry.name.endsWith(".md") && !entry.parentPath.includes("progress");
        })
        .map((entry) =>
        {
            const path = join(entry.parentPath, entry.name);

            return { path, size: readFileSync(path, "utf8").length };
        })
        .filter((doc) =>
        {
            return doc.size > maxCharacters;
        });
}

/** Which of `required` are absent under `root` or present but blank; unreadable counts as missing. */
export function findMissingDocs(root: string, required: readonly string[]): string[]
{
    return required.filter((path) =>
    {
        try
        {
            return readFileSync(join(root, path), "utf8").trim().length === 0;
        }
        catch
        {
            return true;
        }
    });
}

/** Keys of `type Definition` in `contract` that `procedure` never names in backticks; throws when no Definition parses. */
export function findUndocumentedKeys(contract: string, procedure: string): string[]
{
    const shape = /(?:export )?type Definition[\s\S]*?\n\};/.exec(contract)?.[0] ?? "";

    if (shape === "")
    {
        throw new Error("No `type Definition` found, so no key would be checked.");
    }

    const keys = [...shape.matchAll(/^\s{4}([a-zA-Z]+)\??:/gm)].map((match) =>
    {
        return match[1] ?? "";
    });

    if (keys.length === 0)
    {
        throw new Error("`type Definition` parsed to no keys, so no key would be checked.");
    }

    return keys.filter((key) =>
    {
        return !procedure.includes(`\`${key}\``);
    });
}

/** The plugins with no `usage.md`, or one that says nothing. */
export function findUnexplainedPlugins(plugins: string): string[]
{
    if (!existsSync(plugins))
    {
        return [];
    }

    return readdirSync(plugins, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .filter((name) =>
        {
            try
            {
                return readFileSync(join(plugins, name, "usage.md"), "utf8").trim().length === 0;
            }
            catch
            {
                return true;
            }
        });
}

/** A TSDoc sentence in source that no built `.d.ts` carries, so no consumer ever reads it. */
export type PrivateComment = {
    file: string;
    line: number;
    sentence: string;
};

/** TSDoc in `source` whose opening sentence is absent from the built types in `dist`; throws when `dist` holds no build, so build first. */
export function findPrivateComments(source: string, dist: string): PrivateComment[]
{
    if (!existsSync(source))
    {
        return [];
    }

    if (!existsSync(dist))
    {
        throw new Error(`Nothing is built at ${dist}, so no comment can be checked against what ships. Build first.`);
    }

    const published = readdirSync(dist)
        .filter((name) => name.endsWith(".d.ts"))
        .map((name) => readFileSync(join(dist, name), "utf8"))
        .join("\n");

    const comments: PrivateComment[] = [];

    const walk = (folder: string): void =>
    {
        for (const entry of readdirSync(folder, { withFileTypes: true }))
        {
            const path = join(folder, entry.name);

            if (entry.isDirectory())
            {
                if (entry.name !== "tests" && entry.name !== "node_modules")
                {
                    walk(path);
                }

                continue;
            }

            if (!/\.tsx?$/.test(entry.name))
            {
                continue;
            }

            const lines = readFileSync(path, "utf8").split("\n");

            for (let lineNumber = 0; lineNumber < lines.length; lineNumber += 1)
            {
                if (!(lines[lineNumber] ?? "").trim().startsWith("/**"))
                {
                    continue;
                }

                let end = lineNumber;

                while (end < lines.length && !(lines[end] ?? "").includes("*/"))
                {
                    end += 1;
                }

                const sentence = lines.slice(lineNumber, end + 1)
                    .map((line) => line.replace(/^\s*\/?\*+\/?\s?/, "").trim())
                    .filter(Boolean)[0] ?? "";

                if (sentence !== "" && !published.includes(sentence.slice(0, 45)))
                {
                    comments.push({ file: path.replace(`${source}/`, ""), line: lineNumber + 1, sentence });
                }

                lineNumber = end;
            }
        }
    };

    walk(source);

    return comments;
}

/** Where a comment sits: the file, and the line it was written on. */
export type Commented = {
    file: string;
    line: number;
};

function withoutLiterals(source: string): string
{
    const blank = (literal: string): string => " ".repeat(literal.length);

    return source
        .replace(/url\((?![")'])[^)\n]*\)/g, blank)
        .replace(/"(?:[^"\\\n]|\\.)*"/g, blank)
        .replace(/'(?:[^'\\\n]|\\.)*'/g, blank)
        .replace(/`(?:[^`\\]|\\.)*`/g, blank)
        .replace(/(?<=[=(,:[]\s*)\/(?:[^/\\\n[]|\\.|\[(?:[^\]\\]|\\.)*\])+\/[gimsuy]*/g, blank);
}

/** Every comment line in `.ts`, `.tsx` and `.css` under `source`, counting a block once per line and ignoring anything inside a string, template or regex. */
export function findComments(source: string): Commented[]
{
    if (!existsSync(source))
    {
        return [];
    }

    const comments: Commented[] = [];

    const walk = (folder: string): void =>
    {
        for (const entry of readdirSync(folder, { withFileTypes: true }))
        {
            const path = join(folder, entry.name);

            if (entry.isDirectory())
            {
                if (entry.name !== "node_modules")
                {
                    walk(path);
                }

                continue;
            }

            if (!/\.(tsx?|css)$/.test(entry.name))
            {
                continue;
            }

            const lines = withoutLiterals(readFileSync(path, "utf8")).split("\n");
            let inside = false;

            for (let lineNumber = 0; lineNumber < lines.length; lineNumber += 1)
            {
                const line = lines[lineNumber] ?? "";
                const record = (): void =>
                {
                    comments.push({ file: path.replace(`${source}/`, ""), line: lineNumber + 1 });
                };

                if (inside)
                {
                    record();

                    if (line.includes("*/"))
                    {
                        inside = false;
                    }

                    continue;
                }

                if (line.includes("//"))
                {
                    record();

                    continue;
                }

                if (line.includes("/*"))
                {
                    record();

                    inside = !line.includes("*/");
                }
            }
        }
    };

    walk(source);

    return comments;
}
