import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

const root = process.cwd();

const progress = (file: string): string =>
{
    return readFileSync(join(root, "#docs", "progress", file), "utf8");
};

const claimed = (file: string): number =>
{
    return Number(/(\d+) tests/.exec(progress(file))?.[1] ?? Number.NaN);
};

const folders = (at: string): number =>
{
    return readdirSync(join(root, at), { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .length;
};

describe("what the progress notes claim about this package", () =>
{
    test("says the same test count in every document that says one", () =>
    {
        expect(claimed("brief.md")).toBe(claimed("done.md"));
    });

    test("and a count no lower than the tests written, so a stale number cannot stand", () =>
    {
        const written = readdirSync(join(root, "src"), { withFileTypes: true, recursive: true })
            .filter((entry) => entry.isFile() && /\.test\.tsx?$/.test(entry.name))
            .reduce((sum, entry) =>
            {
                return sum + (readFileSync(join(entry.parentPath, entry.name), "utf8").match(/^\s*(?:test|it)(?:\.\w+)?\(/gm)?.length ?? 0);
            }, 0);

        expect(written).toBeGreaterThan(0);

        expect(claimed("brief.md")).toBeGreaterThanOrEqual(written);
        expect(claimed("brief.md")).toBeLessThanOrEqual(written + 40);
    });

    test("names as many plugins as src/plugins holds", () =>
    {
        const spelled: Record<string, number> = { Three: 3, Four: 4, Five: 5, Six: 6, Seven: 7, Eight: 8, Nine: 9, Ten: 10 };
        const claimedWord = /^(\w+) plugins/m.exec(progress("brief.md"))?.[1] ?? "";

        expect(spelled[claimedWord]).toBe(folders(join("src", "plugins")));
    });
});
