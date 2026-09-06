import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";

import { findUnusedFields } from "../wiring";

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
    root = mkdtempSync(join(tmpdir(), "wiring-"));

    for (const [path, source] of Object.entries(files))
    {
        const full = join(root, path);

        mkdirSync(join(full, ".."), { recursive: true });
        writeFileSync(full, source);
    }

    return root;
}

describe("a declared field", () =>
{
    test("passes when something reads it", () =>
    {
        const unread = findUnusedFields(
            tree({
                "shape.ts": "export type Item = { title: string };",
                "use.ts": 'import type { Item } from "./shape";\nexport const name = (one: Item) => one.title;',
            }),
        );

        expect(unread).toEqual([]);
    });

    test("is reported when nothing does", () =>
    {
        const unread = findUnusedFields(
            tree({
                "shape.ts": "export type Item = { title: string; unused: number };",
                "use.ts": 'import type { Item } from "./shape";\nexport const name = (one: Item) => one.title;',
            }),
        );

        expect(unread.map((one) => one.field)).toEqual(["unused"]);
        expect(unread[0]?.shape).toBe("Item");
    });

    test("counts a read through destructuring", () =>
    {
        const unread = findUnusedFields(
            tree({
                "shape.ts": "export type Item = { title: string };",
                "use.ts": 'import type { Item } from "./shape";\nexport const name = (one: Item) => { const { title } = one; return title; };',
            }),
        );

        expect(unread).toEqual([]);
    });

    test("and one that destructures with a default", () =>
    {
        const unread = findUnusedFields(
            tree({
                "shape.ts": "export type State = { loading?: boolean };",
                "use.ts": 'import type { State } from "./shape";\nexport const busy = (one: State) => { const { loading = false } = one; return loading; };',
            }),
        );

        expect(unread).toEqual([]);
    });

    test("does not count a parameter inside a function type", () =>
    {
        const unread = findUnusedFields(tree({ "shape.ts": "export type Log = { info: (line: string, about?: object) => void };\nexport const write = (log: Log) => log.info(\"x\");" }));

        expect(unread).toEqual([]);
    });

    test("sees a field read far below its own declaration", () =>
    {
        const unread = findUnusedFields(
            tree({
                "shape.ts": "export type Item = { title: string };\n\nconst pad = 1;\nvoid pad;\n\nexport const name = (one: Item) => one.title;",
            }),
        );

        expect(unread).toEqual([]);
    });
});
