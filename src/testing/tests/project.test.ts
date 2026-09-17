import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";

import { Project } from "../project";

let root = "";

afterEach(() =>
{
    if (root !== "")
    {
        rmSync(root, { recursive: true, force: true });
        root = "";
    }
});

function createProject(): string
{
    root = mkdtempSync(join(tmpdir(), "project-"));

    mkdirSync(join(root, "src", "plugins", "demo"), { recursive: true });

    writeFileSync(join(root, "src", "plugins", "demo", "plugin.ts"), 'export default definePlugin("demo", {});\n');
    writeFileSync(join(root, "src", "plugins", "demo", "usage.md"), "# demo\n\nWhat it is for.\n");

    return root;
}

describe("what a project refuses", () =>
{
    test("says nothing about a project that holds together", () =>
    {
        expect(Project.findAll({ root: createProject() })).toEqual([]);
    });

    test("still runs the structural checks when the documents are packed away", () =>
    {
        const at = createProject();

        mkdirSync(join(at, "src", "plugins", "ghost"), { recursive: true });
        writeFileSync(join(at, "src", "plugins", "ghost", "stray.ts"), "export const stray = 1;\n");

        expect(Project.findAll({ root: at }).map((problem) => problem.check)).toContain("unexplained");
    });

    test("and says which checks it could not run, so a green report is not mistaken for a full one", () =>
    {
        const at = createProject();

        expect(Project.findAll({ root: at })).toEqual([]);
        expect(Project.findSkipped({ root: at }).map((report) => report.check)).toEqual(["documents"]);
        expect(Project.findSkipped({ root: at })[0]?.message).toContain("not on disk");
    });

    test("without calling folded-away documents a breach, since that is how they ship", () =>
    {
        const at = createProject();

        expect(Project.findAll({ root: at, required: ["#docs/usage.md"] })).toEqual([]);
    });

    test("and skips nothing once the documents are there to read", () =>
    {
        const at = createProject();

        mkdirSync(join(at, "#docs"), { recursive: true });
        writeFileSync(join(at, "#docs", "usage.md"), "# how\n");

        expect(Project.findSkipped({ root: at })).toEqual([]);
    });

    test("measuring a document that outgrew its point once they are unpacked", () =>
    {
        const at = createProject();

        mkdirSync(join(at, "#docs"), { recursive: true });
        writeFileSync(join(at, "#docs", "long.md"), "x".repeat(2000));

        expect(Project.findAll({ root: at }).map((problem) => problem.check)).toContain("oversized");
    });

    test("and naming a document every application is asked for and does not hold", () =>
    {
        const at = createProject();

        mkdirSync(join(at, "#docs"), { recursive: true });
        writeFileSync(join(at, "#docs", "usage.md"), "# how\n");

        const found = Project.findAll({ root: at, required: ["#docs/stack.md"] });

        expect(found.map((problem) => problem.check)).toContain("missing");
    });

    test("naming what the literal rule never reached, so a green run is not read as a full one", () =>
    {
        const at = createProject();

        mkdirSync(join(at, "src", "embed"), { recursive: true });
        writeFileSync(join(at, "src", "embed", "skin.ts"), 'export const skin = ".root { color: #ff0000; padding: 12px; }";\n');

        expect(Project.findAll({ root: at })).toEqual([]);

        const skipped = Project.findSkipped({ root: at }).filter((report) => report.check === "literal");

        expect(skipped.length).toBe(1);
        expect(skipped[0]?.message).toContain("embed");
    });

    test("and measuring that same folder once the project says style lives there", () =>
    {
        const at = createProject();

        mkdirSync(join(at, "src", "embed"), { recursive: true });
        writeFileSync(join(at, "src", "embed", "skin.ts"), 'export const skin = ".root { color: #ff0000; padding: 12px; }";\n');

        const found = Project.findAll({ root: at, styleIn: ["embed"] });

        expect(found.map((problem) => problem.check)).toContain("literal");
        expect(Project.findSkipped({ root: at, styleIn: ["embed"] }).filter((report) => report.check === "literal")).toEqual([]);
    });

    test("naming an alias whose file is not there, which nothing says until the first import", () =>
    {
        const at = createProject();

        writeFileSync(join(at, "tsconfig.json"), '{ "compilerOptions": { "paths": { "@ui": ["./src/ui/index.ts"] } } }\n');

        const found = Project.findAll({ root: at });

        expect(found.map((problem) => problem.check)).toContain("dangling");
        expect(found.find((problem) => problem.check === "dangling")?.message).toContain("@ui");
    });

    test("and saying nothing once that file exists", () =>
    {
        const at = createProject();

        mkdirSync(join(at, "src", "ui"), { recursive: true });
        writeFileSync(join(at, "src", "ui", "index.ts"), "export const nothing = 1;\n");
        writeFileSync(join(at, "tsconfig.json"), '{ "compilerOptions": { "paths": { "@ui": ["./src/ui/index.ts"] } } }\n');

        expect(Project.findAll({ root: at }).filter((problem) => problem.check === "dangling")).toEqual([]);
    });

    test("and leaving a folder pattern alone, since it names no single file", () =>
    {
        const at = createProject();

        writeFileSync(join(at, "tsconfig.json"), '{ "compilerOptions": { "paths": { "@plugins/*": ["./src/plugins/*"] } } }\n');

        expect(Project.findAll({ root: at }).filter((problem) => problem.check === "dangling")).toEqual([]);
    });

    test("and saying that a shape it never looks in went unread, so the exemption is not a secret", () =>
    {
        const at = createProject();

        writeFileSync(join(at, "src", "plugins", "demo", "Private.ts"), "type Private = {\n    label: string;\n};\n\nexport const shape: Private = { label: \"x\" };\n");

        expect(Project.findAll({ root: at }).filter((problem) => problem.check === "wiring")).toEqual([]);

        const skipped = Project.findSkipped({ root: at }).filter((report) => report.check === "wiring");

        expect(skipped.length).toBe(1);
        expect(skipped[0]?.message).toContain("not exported");
    });

    test("and saying nothing about shapes when every one of them is exported", () =>
    {
        const at = createProject();

        writeFileSync(join(at, "src", "plugins", "demo", "Open.ts"), "export type Open = {\n    kept: string;\n};\n\nexport const open: Open = { kept: \"x\" };\n");

        expect(Project.findSkipped({ root: at }).filter((report) => report.check === "wiring")).toEqual([]);
    });

    test("naming a word two plugins no longer agree on, since one refuses what the other sends", () =>
    {
        const at = createProject();

        mkdirSync(join(at, "src", "plugins", "auth", "types"), { recursive: true });
        mkdirSync(join(at, "src", "plugins", "settings", "types"), { recursive: true });
        writeFileSync(join(at, "src", "plugins", "auth", "plugin.ts"), 'export default definePlugin("auth", {});\n');
        writeFileSync(join(at, "src", "plugins", "auth", "usage.md"), "# auth\n\nWho is looking.\n");
        writeFileSync(join(at, "src", "plugins", "settings", "plugin.ts"), 'export default definePlugin("settings", { dependsOn: ["auth"] });\n');
        writeFileSync(join(at, "src", "plugins", "settings", "usage.md"), "# settings\n\nWhat they chose.\n");
        writeFileSync(join(at, "src", "plugins", "auth", "types", "Role.ts"), 'export const Role = z.enum(["owner", "admin", "staff"]);\n');
        writeFileSync(join(at, "src", "plugins", "settings", "types", "Role.ts"), 'export const Role = z.enum(["owner", "admin"]);\n');

        const found = Project.findAll({ root: at });

        expect(found.map((problem) => problem.check)).toContain("split");
        expect(found.find((problem) => problem.check === "split")?.message).toContain("staff");
    });

    test("and left alone when neither reaches the other, since a word may mean two things in two domains", () =>
    {
        const at = createProject();

        mkdirSync(join(at, "src", "plugins", "auth", "types"), { recursive: true });
        mkdirSync(join(at, "src", "plugins", "chat", "types"), { recursive: true });
        writeFileSync(join(at, "src", "plugins", "auth", "plugin.ts"), 'export default definePlugin("auth", {});\n');
        writeFileSync(join(at, "src", "plugins", "auth", "usage.md"), "# auth\n\nWho is looking.\n");
        writeFileSync(join(at, "src", "plugins", "chat", "plugin.ts"), 'export default definePlugin("chat", {});\n');
        writeFileSync(join(at, "src", "plugins", "chat", "usage.md"), "# chat\n\nWho is talking.\n");
        writeFileSync(join(at, "src", "plugins", "auth", "types", "Role.ts"), 'export const Role = z.enum(["owner", "admin", "staff"]);\n');
        writeFileSync(join(at, "src", "plugins", "chat", "types", "Role.ts"), 'export const Role = z.enum(["owner", "admin"]);\n');

        expect(Project.findAll({ root: at }).filter((problem) => problem.check === "split")).toEqual([]);
    });

    test("and refusing a copy of one, since the day a member is added only one of them learns", () =>
    {
        const at = createProject();

        mkdirSync(join(at, "src", "plugins", "auth", "types"), { recursive: true });
        mkdirSync(join(at, "src", "plugins", "settings", "types"), { recursive: true });
        writeFileSync(join(at, "src", "plugins", "auth", "plugin.ts"), 'export default definePlugin("auth", {});\n');
        writeFileSync(join(at, "src", "plugins", "auth", "usage.md"), "# auth\n\nWho is looking.\n");
        writeFileSync(join(at, "src", "plugins", "settings", "plugin.ts"), 'export default definePlugin("settings", {});\n');
        writeFileSync(join(at, "src", "plugins", "settings", "usage.md"), "# settings\n\nWhat they chose.\n");
        writeFileSync(join(at, "src", "plugins", "auth", "types", "Role.ts"), 'export const Role = z.enum(["owner", "admin"]);\n');
        writeFileSync(join(at, "src", "plugins", "settings", "types", "Role.ts"), 'export const Role = z.enum(["admin", "owner"]);\n');

        expect(Project.findAll({ root: at }).filter((problem) => problem.check === "split")).toEqual([]);
        expect(Project.findAll({ root: at }).map((problem) => problem.check)).toContain("twice");
    });

    test("and reaches code shared between plugins, not only the plugins", () =>
    {
        const at = createProject();

        mkdirSync(join(at, "src", "utils"), { recursive: true });
        const shape = ["export", "type", "Price", "=", "{ cents: number; unread: string };"].join(" ");

        writeFileSync(join(at, "src", "utils", "Money.ts"), `${shape}\n`);

        expect(Project.findAll({ root: at }).map((problem) => problem.check)).toContain("wiring");
    });

    test("and the shared layer, where the same dead field reads the same way", () =>
    {
        const at = createProject();

        mkdirSync(join(at, "src", "ui", "components"), { recursive: true });
        const shape = ["export", "type", "Look", "=", "{ tone: string; unread: string };"].join(" ");

        writeFileSync(join(at, "src", "ui", "components", "Look.ts"), `${shape}\n`);

        expect(Project.findAll({ root: at }).map((problem) => problem.check)).toContain("wiring");
    });

    test("and names a class a module never declared", () =>
    {
        const at = createProject();

        writeFileSync(join(at, "src", "plugins", "demo", "Card.module.css"), ".root { color: red; }\n");
        writeFileSync(join(at, "src", "plugins", "demo", "Card.tsx"), "export const Card = () => <p className={styles.head} />;\n");

        expect(Project.findAll({ root: at }).map((problem) => problem.check)).toContain("class");
    });
});

describe("a size a project promised about a file it serves", () =>
{
    /** A built file of a known weight, as a bundler would leave one. */
    function built(at: string, path: string, holds: string): void
    {
        mkdirSync(join(at, "public"), { recursive: true });
        writeFileSync(join(at, path), holds);
    }

    test("says nothing while the file is under it", () =>
    {
        const at = createProject();

        built(at, "public/widget.js", "a");

        expect(Project.findAll({ root: at, budgets: { "public/widget.js": 4096 } })).toEqual([]);
    });

    test("names the file, what it weighs, and what was promised", () =>
    {
        const at = createProject();

        // Measured: gzip returns a few bytes for a compressible string, so the fixture must be random.
        built(at, "public/widget.js", [...Array(8192)].map(() => Math.random().toString(36)).join(""));

        const [problem] = Project.findAll({ root: at, budgets: { "public/widget.js": 1024 } });

        expect(problem?.check).toBe("budget");
        expect(problem?.message).toMatch(/public\/widget\.js is \d+ bytes gzipped, over the 1024/);
    });

    test("a file nobody built is skipped, never passed", () =>
    {
        const at = createProject();

        // A skip, not a pass: a budget nobody measured reads exactly like one that held.
        expect(Project.findAll({ root: at, budgets: { "public/widget.js": 1024 } })).toEqual([]);

        const [skipped] = Project.findSkipped({ root: at, budgets: { "public/widget.js": 1024 } })
            .filter((report) => report.check === "budget");

        expect(skipped?.message).toMatch(/public\/widget\.js is not built/);
    });

    test("weighs each file against its own number", () =>
    {
        const at = createProject();

        built(at, "public/small.js", "a");
        built(at, "public/large.js", [...Array(8192)].map(() => Math.random().toString(36)).join(""));

        const named = Project.findAll({ root: at, budgets: { "public/small.js": 4096, "public/large.js": 1024 } })
            .filter((problem) => problem.check === "budget")
            .map((problem) => problem.message.split(" ")[0]);

        expect(named).toEqual(["public/large.js"]);
    });
});

describe("the other half of an application split across two stacks", () =>
{
    test("is reported when a guard cannot reach it, because reading nothing passes", () =>
    {
        const at = createProject();

        const skipped = Project.findSkipped({ root: at, otherStacks: ["../api/src/plugins"] })
            .filter((report) => report.check === "across");

        expect(skipped).toHaveLength(1);
        expect(skipped[0]?.message).toContain("../api/src/plugins");
        expect(skipped[0]?.message).toContain("compared nothing and still passed");
    });

    test("is silent once it is there, so the guard reading it is trusted", () =>
    {
        const at = createProject();

        mkdirSync(join(at, "..", "api", "src", "plugins"), { recursive: true });

        const skipped = Project.findSkipped({ root: at, otherStacks: ["../api/src/plugins"] })
            .filter((report) => report.check === "across");

        rmSync(join(at, "..", "api"), { recursive: true, force: true });

        expect(skipped).toEqual([]);
    });

    test("is silent when no application named one, because most hold only one half", () =>
    {
        const at = createProject();

        expect(Project.findSkipped({ root: at }).filter((report) => report.check === "across")).toEqual([]);
    });
});

describe("a document a worked example fills", () =>
{
    test("is left alone where it is named, since an example runs longer than a procedure", () =>
    {
        const at = createProject();

        mkdirSync(join(at, "#docs"), { recursive: true });
        writeFileSync(join(at, "#docs", "example.md"), "x".repeat(2000));

        const found = Project.findAll({ root: at, worked: ["example.md"] })
            .filter((problem) => problem.check === "oversized");

        expect(found).toEqual([]);
    });

    test("and still refused once it runs past even a worked example's ceiling", () =>
    {
        const at = createProject();

        mkdirSync(join(at, "#docs"), { recursive: true });
        writeFileSync(join(at, "#docs", "example.md"), "x".repeat(4000));

        const found = Project.findAll({ root: at, worked: ["example.md"] })
            .filter((problem) => problem.check === "oversized");

        expect(found).toHaveLength(1);
        expect(found[0]?.message).toContain("run past even that");
    });

    test("while one nobody named is held to the ordinary limit", () =>
    {
        const at = createProject();

        mkdirSync(join(at, "#docs"), { recursive: true });
        writeFileSync(join(at, "#docs", "ordinary.md"), "x".repeat(2000));

        const found = Project.findAll({ root: at, worked: ["example.md"] })
            .filter((problem) => problem.check === "oversized");

        expect(found).toHaveLength(1);
        expect(found[0]?.message).toContain("keeps its point at");
    });
});

describe("a key the contract accepts", () =>
{
    const contract = "type Definition = {\n    version: string;\n    slots?: unknown;\n};";

    test("is refused where no document writes it, since an author never learns it exists", () =>
    {
        const at = createProject();

        mkdirSync(join(at, "#docs"), { recursive: true });
        writeFileSync(join(at, "#docs", "a.md"), "`version` is required.\n");

        const found = Project.findAll({ root: at, contract })
            .filter((problem) => problem.check === "undocumented");

        expect(found).toHaveLength(1);
        expect(found[0]?.message).toContain("slots");
    });

    test("and left alone once a document writes it in backticks, which is what the check reads", () =>
    {
        const at = createProject();

        mkdirSync(join(at, "#docs"), { recursive: true });
        writeFileSync(join(at, "#docs", "a.md"), "`version` and `slots` are both keys.\n");

        expect(Project.findAll({ root: at, contract }).filter((problem) => problem.check === "undocumented")).toEqual([]);
    });

    test("and says nothing at all where no contract was handed over", () =>
    {
        const at = createProject();

        mkdirSync(join(at, "#docs"), { recursive: true });
        writeFileSync(join(at, "#docs", "a.md"), "nothing in backticks\n");

        expect(Project.findAll({ root: at }).filter((problem) => problem.check === "undocumented")).toEqual([]);
    });
});
