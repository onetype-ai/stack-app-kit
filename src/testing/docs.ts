import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

export type Oversized = {
    path: string;
    size: number;
};

export type Undocumented = {
    key: string;
};

const LIMIT = 1800;

// A contract nobody can read in one sitting is a contract nobody reads. What
// grows past this is two documents, or a rule that belongs in code.
export function oversized(root: string, limit: number = LIMIT): Oversized[]
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

// A document that is present but empty reads as done and says nothing, which
// is worse than one that is missing and obviously so.
export function missing(root: string, required: readonly string[]): string[]
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

// Every key the contract accepts is named in the procedure that explains it.
// A key added to one and not the other is how a document starts lying.
//
// `export` is optional because a build emits the shape without it, and a
// contract that parsed to nothing threw no error: it answered "nothing is
// undocumented" while reading nothing at all.
export function undocumented(contract: string, procedure: string): string[]
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
