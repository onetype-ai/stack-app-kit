import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";

import { findComments, findMissingDocs, findOversizedDocs, findPrivateComments, findUndocumentedKeys, findUnexplainedPlugins } from "../docs";

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

    test("reads a shape a build emitted without export", () =>
    {
        const withoutExport = contract.replace("export type", "type");

        expect(findUndocumentedKeys(withoutExport, "- `version`: the version.")).toEqual(["grants"]);
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

describe("a plugin nobody can read", () =>
{
    test("is named when it ships no usage.md", () =>
    {
        const at = tree({});

        mkdirSync(join(at, "plugins", "cart"), { recursive: true });
        writeFileSync(join(at, "plugins", "cart", "plugin.ts"), "export default {};\n");

        expect(findUnexplainedPlugins(join(at, "plugins"))).toEqual(["cart"]);
    });

    test("and when the one it ships says nothing", () =>
    {
        const at = tree({});

        mkdirSync(join(at, "plugins", "cart"), { recursive: true });
        writeFileSync(join(at, "plugins", "cart", "usage.md"), "   \n");

        expect(findUnexplainedPlugins(join(at, "plugins"))).toEqual(["cart"]);
    });

    test("but says nothing when every plugin explains itself", () =>
    {
        const at = tree({});

        mkdirSync(join(at, "plugins", "cart"), { recursive: true });
        writeFileSync(join(at, "plugins", "cart", "usage.md"), "# cart\n\nWhat it is for.\n");

        expect(findUnexplainedPlugins(join(at, "plugins"))).toEqual([]);
    });
});

describe("a comment nobody outside this package can read", () =>
{
    test("does not exist: every one left in src reaches the published types", () =>
    {
        const found = findPrivateComments(join(process.cwd(), "src"), join(process.cwd(), "dist"))
            .map((one) => `${one.file}:${String(one.line)} ${one.sentence}`);

        expect(found).toEqual([]);
    });
});

describe("a comment in an application's own source", () =>
{
    const wrote = (files: Readonly<Record<string, string>>): string =>
    {
        root = mkdtempSync(join(tmpdir(), "comments-"));

        for (const [path, source] of Object.entries(files))
        {
            mkdirSync(join(root, path, ".."), { recursive: true });
            writeFileSync(join(root, path), source);
        }

        return root;
    };

    test("is found, wherever it hides", () =>
    {
        const at = wrote({
            "a.ts": "const one = 1;\n// a line\nconst two = 2;\n",
            "b/c.tsx": "/* a block\n   over two lines */\nexport const C = () => null;\n",
            "d.css": ".root { color: red; } /* beside a rule */\n",
        });

        const found = findComments(at).map((one) => `${one.file}:${String(one.line)}`);

        expect(found).toEqual(["a.ts:2", "b/c.tsx:1", "b/c.tsx:2", "d.css:1"]);
    });

    test("including one hiding at the end of a line of code", () =>
    {
        const at = wrote({ "a.ts": "const one = 1; // said here\n" });

        expect(findComments(at)).toHaveLength(1);
    });

    test("and source with none of them answers nothing", () =>
    {
        const at = wrote({ "a.ts": "const one = 1;\nconst two = 2;\n" });

        expect(findComments(at)).toEqual([]);
    });

    test("while a url in a string is not one", () =>
    {
        const at = wrote({ "a.ts": 'const at = "https://example.invalid/thing";\n' });

        expect(findComments(at)).toEqual([]);
    });
});

describe("what is not a comment, however much it looks like one", () =>
{
    const wrote = (source: string): string =>
    {
        root = mkdtempSync(join(tmpdir(), "notcomments-"));

        writeFileSync(join(root, "a.ts"), source);

        return root;
    };

    test("a slash inside a regular expression", () =>
    {
        expect(findComments(wrote('const at = /from "@plugins\\//;\n'))).toEqual([]);
    });

    test("a glob path inside a call", () =>
    {
        expect(findComments(wrote('const found = glob("../plugins/*/plugin.ts");\n'))).toEqual([]);
    });

    test("and a url in a template string", () =>
    {
        expect(findComments(wrote('const at = `https://example.invalid/x`;\n'))).toEqual([]);
    });

    test("and an address a stylesheet reaches for, which carries no quotes", () =>
    {
        root = mkdtempSync(join(tmpdir(), "notcomments-"));

        writeFileSync(join(root, "a.css"), "@import url(https://example.invalid/x.css);\n");

        expect(findComments(root)).toEqual([]);
    });
});
