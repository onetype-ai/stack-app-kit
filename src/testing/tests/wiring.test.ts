import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";

import { wiring } from "../wiring";

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
        const found = wiring(
            tree({
                "shape.ts": "export type Item = { title: string };",
                "use.ts": 'import type { Item } from "./shape";\nexport const name = (one: Item) => one.title;',
            }),
        );

        expect(found).toEqual([]);
    });

    test("is reported when nothing does", () =>
    {
        const found = wiring(
            tree({
                "shape.ts": "export type Item = { title: string; unused: number };",
                "use.ts": 'import type { Item } from "./shape";\nexport const name = (one: Item) => one.title;',
            }),
        );

        expect(found.map((one) => one.field)).toEqual(["unused"]);
        expect(found[0]?.shape).toBe("Item");
    });

    test("counts a read through destructuring", () =>
    {
        const found = wiring(
            tree({
                "shape.ts": "export type Item = { title: string };",
                "use.ts": 'import type { Item } from "./shape";\nexport const name = (one: Item) => { const { title } = one; return title; };',
            }),
        );

        expect(found).toEqual([]);
    });

    test("and one that destructures with a default", () =>
    {
        const found = wiring(
            tree({
                "shape.ts": "export type State = { loading?: boolean };",
                "use.ts": 'import type { State } from "./shape";\nexport const busy = (one: State) => { const { loading = false } = one; return loading; };',
            }),
        );

        expect(found).toEqual([]);
    });

    test("does not count a parameter inside a function type", () =>
    {
        const found = wiring(tree({ "shape.ts": "export type Log = { info: (line: string, about?: object) => void };\nexport const write = (log: Log) => log.info(\"x\");" }));

        expect(found).toEqual([]);
    });

    test("sees a field read far below its own declaration", () =>
    {
        const found = wiring(
            tree({
                "shape.ts": "export type Item = { title: string };\n\nconst pad = 1;\nvoid pad;\n\nexport const name = (one: Item) => one.title;",
            }),
        );

        expect(found).toEqual([]);
    });
});
