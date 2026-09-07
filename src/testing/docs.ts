import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

export type OversizedDoc = {
    path: string;
    size: number;
};

export type UndocumentedKey = {
    key: string;
};

const LIMIT = 1800;

export function findOversizedDocs(root: string, limit: number = LIMIT): OversizedDoc[]
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
            return doc.size > limit;
        });
}

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

/**
 * The plugins with no `usage.md`, or one that says nothing.
 *
 * A plugin is a capability someone else has to understand before they can
 * depend on it, and its contract says what crosses the boundary rather than
 * why anyone would want it. A folder with no `usage.md` is one nobody can
 * decide about without reading its source.
 */
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

export type PrivateComment = {
    file: string;
    line: number;
    sentence: string;
};

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
        .filter((one) => one.endsWith(".d.ts"))
        .map((one) => readFileSync(join(dist, one), "utf8"))
        .join("\n");

    const found: PrivateComment[] = [];

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

            for (let at = 0; at < lines.length; at += 1)
            {
                if (!(lines[at] ?? "").trim().startsWith("/**"))
                {
                    continue;
                }

                let end = at;

                while (end < lines.length && !(lines[end] ?? "").includes("*/"))
                {
                    end += 1;
                }

                const sentence = lines.slice(at, end + 1)
                    .map((one) => one.replace(/^\s*\/?\*+\/?\s?/, "").trim())
                    .filter(Boolean)[0] ?? "";

                if (sentence !== "" && !published.includes(sentence.slice(0, 45)))
                {
                    found.push({ file: path.replace(`${source}/`, ""), line: at + 1, sentence });
                }

                at = end;
            }
        }
    };

    walk(source);

    return found;
}

export type Commented = {
    file: string;
    line: number;
};

function withoutLiterals(source: string): string
{
    const blank = (held: string): string => " ".repeat(held.length);

    return source
        .replace(/"(?:[^"\\\n]|\\.)*"/g, blank)
        .replace(/'(?:[^'\\\n]|\\.)*'/g, blank)
        .replace(/`(?:[^`\\]|\\.)*`/g, blank)
        .replace(/(?<=[=(,:[]\s*)\/(?:[^/\\\n[]|\\.|\[(?:[^\]\\]|\\.)*\])+\/[gimsuy]*/g, blank);
}

export function findComments(source: string): Commented[]
{
    if (!existsSync(source))
    {
        return [];
    }

    const found: Commented[] = [];

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

            for (let at = 0; at < lines.length; at += 1)
            {
                const line = lines[at] ?? "";
                const said = (): void =>
                {
                    found.push({ file: path.replace(`${source}/`, ""), line: at + 1 });
                };

                if (inside)
                {
                    said();

                    if (line.includes("*/"))
                    {
                        inside = false;
                    }

                    continue;
                }

                if (line.includes("//"))
                {
                    said();

                    continue;
                }

                if (line.includes("/*"))
                {
                    said();

                    inside = !line.includes("*/");
                }
            }
        }
    };

    walk(source);

    return found;
}
