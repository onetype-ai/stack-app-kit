import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";

import { findDanglingPaths, findUnusedFields } from "../wiring";

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

        expect(unread.map((field) => field.field)).toEqual(["unused"]);
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

describe("an alias resolving to nothing", () =>
{
    const tsconfig = (paths: Readonly<Record<string, string>>): string =>
        JSON.stringify({ compilerOptions: { paths: Object.fromEntries(Object.entries(paths).map(([alias, target]) => [alias, [`./${target}`]])) } });

    const vite = (lines: readonly string[]): string =>
        `export default { resolve: { alias: [\n${lines.join("\n")}\n] } };`;

    test("is named, with the file that declared it", () =>
    {
        const dead = findDanglingPaths(tree({
            "tsconfig.json": tsconfig({ "@ui": "src/ui/index.ts" }),
            "src/other.ts": "export const x = 1;",
        }));

        expect(dead).toEqual([{ alias: "@ui", target: "./src/ui/index.ts", file: "tsconfig.json" }]);
    });

    test("says nothing when the file is there", () =>
    {
        const dead = findDanglingPaths(tree({
            "tsconfig.json": tsconfig({ "@ui": "src/ui/index.ts" }),
            "src/ui/index.ts": "export const Example = 1;",
        }));

        expect(dead).toEqual([]);
    });

    test("a folder alias wants a folder, and a file where a folder was named is not one", () =>
    {
        const dead = findDanglingPaths(tree({
            "tsconfig.json": tsconfig({ "@plugins/*": "src/plugins/*", "@utils/*": "src/utils/*" }),
            "src/plugins/one/plugin.ts": "export default 1;",
            "src/utils": "not a folder",
        }));

        expect(dead).toEqual([{ alias: "@utils/*", target: "./src/utils/*", file: "tsconfig.json" }]);
    });

    test("an empty folder is a folder: a layer with nothing in it yet is not a broken alias", () =>
    {
        expect(findDanglingPaths(tree({ "tsconfig.json": tsconfig({ "@utils/*": "src/utils/*" }), "src/utils/keep.md": "" }))).toEqual([]);
    });

    test("both maps are read, so the compiler and the bundler cannot disagree in silence", () =>
    {
        const dead = findDanglingPaths(tree({
            "tsconfig.json": tsconfig({ "@ui": "src/ui/index.ts" }),
            "vite.config.ts": vite(['{ find: /^@ui$/, replacement: resolvePath("./src/ui/index.ts") },']),
        }));

        expect(dead.map((one) => one.file)).toEqual(["tsconfig.json", "vite.config.ts"]);
    });

    test("a vite folder alias is told apart from a vite file alias by its pattern", () =>
    {
        const dead = findDanglingPaths(tree({
            "vite.config.ts": vite([
                '{ find: /^@ui$/, replacement: resolvePath("./src/ui/index.ts") },',
                '{ find: /^@ui\\//, replacement: `${resolvePath("./src/ui")}/` },',
            ]),
            "src/ui/index.ts": "export const Example = 1;",
        }));

        expect(dead).toEqual([]);
    });
});
