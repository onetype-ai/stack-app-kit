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
        expect(Project.checks({ root: createProject() })).toEqual([]);
    });

    /* The document checks read #docs and the structural ones read code. A
       project that packed its documents away is not an unchecked project, so
       a missing #docs must not throw and take the others down with it. */
    test("still runs the structural checks when the documents are packed away", () =>
    {
        const at = createProject();

        mkdirSync(join(at, "src", "plugins", "ghost"), { recursive: true });
        writeFileSync(join(at, "src", "plugins", "ghost", "thing.ts"), "export const thing = 1;\n");

        expect(Project.checks({ root: at }).map((problem) => problem.check)).toContain("unexplained");
    });

    /* Code shared between plugins belongs to nobody, which is exactly why a
       stale field there goes unnoticed longer than one inside a plugin. */
    test("and reaches code shared between plugins, not only the plugins", () =>
    {
        const at = createProject();

        mkdirSync(join(at, "src", "utils"), { recursive: true });
        /* Built rather than written whole: a shape spelled out here would be
           read by the very check this package runs on itself. */
        const shape = ["export", "type", "Price", "=", "{ cents: number; unread: string };"].join(" ");

        writeFileSync(join(at, "src", "utils", "Money.ts"), `${shape}\n`);

        expect(Project.checks({ root: at }).map((problem) => problem.check)).toContain("wiring");
    });

    test("and names a class a module never declared", () =>
    {
        const at = createProject();

        writeFileSync(join(at, "src", "plugins", "demo", "Card.module.css"), ".root { color: red; }\n");
        writeFileSync(join(at, "src", "plugins", "demo", "Card.tsx"), "export const Card = () => <p className={styles.head} />;\n");

        expect(Project.checks({ root: at }).map((problem) => problem.check)).toContain("class");
    });
});
