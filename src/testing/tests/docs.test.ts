import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";

import { findMissingDocs, findOversizedDocs, findUndocumentedKeys } from "../docs";

let root = "";

afterEach(() =>
{
    if (root !== "")
    {
        rmSync(root, { recursive: true, force: true });
        root = "";
    }
});

function tree(files: Readonly<Record<string, string>>): string
{
    root = mkdtempSync(join(tmpdir(), "docs-"));

    for (const [path, body] of Object.entries(files))
    {
        const full = join(root, path);

        mkdirSync(join(full, ".."), { recursive: true });
        writeFileSync(full, body);
    }

    return root;
}

describe("oversized", () =>
{
    test("names a document past the limit, with its size", () =>
    {
        const problems = findOversizedDocs(tree({ "contract.md": "x".repeat(1801) }));

        expect(problems).toHaveLength(1);
        expect(problems[0]?.size).toBe(1801);
    });

    test("passes a document at the limit", () =>
    {
        expect(findOversizedDocs(tree({ "contract.md": "x".repeat(1800) }))).toEqual([]);
    });

    test("ignores progress, which is a log rather than a contract", () =>
    {
        const problems = findOversizedDocs(tree({ "progress/done.md": "x".repeat(5000) }));

        expect(problems).toEqual([]);
    });

    test("an absent folder is not a failure", () =>
    {
        expect(findOversizedDocs(join(tmpdir(), "nothing-here-at-all"))).toEqual([]);
    });
});

describe("missing", () =>
{
    test("reports one that is absent", () =>
    {
        expect(findMissingDocs(tree({ "usage.md": "held" }), ["usage.md", "gone.md"])).toEqual(["gone.md"]);
    });

    test("reports one that is present but empty", () =>
    {
        expect(findMissingDocs(tree({ "usage.md": "   \n  " }), ["usage.md"])).toEqual(["usage.md"]);
    });
});

describe("undocumented", () =>
{
    const contract = `export type Definition = {
    version: string;
    grants?: () => string[];
};`;

    test("names a key the procedure never mentions", () =>
    {
        expect(findUndocumentedKeys(contract, "- `version`: the version.")).toEqual(["grants"]);
    });

    test("passes when every key is named", () =>
    {
        expect(findUndocumentedKeys(contract, "- `version` and `grants`.")).toEqual([]);
    });

    // A build emits the shape without `export`, and reading it as nothing is
    // how this answered "all documented" while checking no key at all.
    test("reads a shape a build emitted without export", () =>
    {
        const built = contract.replace("export type", "type");

        expect(findUndocumentedKeys(built, "- `version`: the version.")).toEqual(["grants"]);
    });

    test("refuses a contract holding no Definition", () =>
    {
        expect(() => findUndocumentedKeys("type Other = {\n    a: string;\n};", "")).toThrow(/no key would be checked/);
    });

    test("refuses a Definition that parsed to no keys", () =>
    {
        expect(() => findUndocumentedKeys("type Definition = {\n};", "")).toThrow(/no key would be checked/);
    });
});
