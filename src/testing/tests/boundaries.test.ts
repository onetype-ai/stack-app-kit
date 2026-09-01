import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";

import { boundaries } from "../boundaries";

let root = "";

afterEach(() =>
{
    if (root !== "")
    {
        rmSync(root, { recursive: true, force: true });
        root = "";
    }
});

/** Writes a plugin tree on disk, because that is what the check reads. */
function tree(plugins: Readonly<Record<string, Readonly<Record<string, string>>>>): string
{
    root = mkdtempSync(join(tmpdir(), "boundaries-"));

    for (const [name, files] of Object.entries(plugins))
    {
        for (const [path, source] of Object.entries(files))
        {
            const full = join(root, name, path);

            mkdirSync(join(full, ".."), { recursive: true });
            writeFileSync(full, source);
        }
    }

    return root;
}

const declares = (name: string, needs: readonly string[] = []): string =>
    `export default definePlugin("${name}", { dependsOn: [${needs.map((one) => `"${one}"`).join(", ")}] });`;

describe("a plugin reaching another", () =>
{
    test("passes when it is declared and goes through the public index", () =>
    {
        const found = boundaries(
            tree({
                auth: { "plugin.ts": declares("auth") },
                demo: {
                    "plugin.ts": declares("demo", ["auth"]),
                    "services/items.ts": 'import { useAuth } from "@plugins/auth";',
                },
            }),
        );

        expect(found).toEqual([]);
    });

    test("refuses an import nothing declared", () =>
    {
        const found = boundaries(
            tree({
                auth: { "plugin.ts": declares("auth") },
                demo: {
                    "plugin.ts": declares("demo"),
                    "services/items.ts": 'import { useAuth } from "@plugins/auth";',
                },
            }),
        );

        expect(found.map((one) => one.rule)).toContain("undeclared");
        expect(found[0]?.message).toMatch(/without declaring "auth"/);
    });

    test("refuses a reach past the public index", () =>
    {
        const found = boundaries(
            tree({
                auth: { "plugin.ts": declares("auth") },
                demo: {
                    "plugin.ts": declares("demo", ["auth"]),
                    "services/items.ts": 'import { Session } from "@plugins/auth/types/Session";',
                },
            }),
        );

        expect(found.map((one) => one.rule)).toContain("deep");
    });

    test("refuses a relative path that climbs into another plugin", () =>
    {
        const found = boundaries(
            tree({
                auth: { "plugin.ts": declares("auth"), "types/Session.ts": "export type Session = { id: string };" },
                demo: {
                    "plugin.ts": declares("demo", ["auth"]),
                    "services/items.ts": 'import type { Session } from "../../auth/types/Session";',
                },
            }),
        );

        expect(found.map((one) => one.rule)).toContain("deep");
        expect(found.some((one) => one.message.includes("../../auth/types/Session"))).toBe(true);
    });

    test("ignores a relative import inside one plugin", () =>
    {
        const found = boundaries(
            tree({
                demo: {
                    "plugin.ts": declares("demo"),
                    "services/items.ts": 'import { DemoItem } from "../types/DemoItem";',
                    "types/DemoItem.ts": "export type DemoItem = { id: string };",
                },
            }),
        );

        expect(found).toEqual([]);
    });
});

describe("cycles", () =>
{
    test("names a loop between two plugins", () =>
    {
        const found = boundaries(
            tree({
                a: { "plugin.ts": declares("a", ["b"]), "use.ts": 'import { b } from "@plugins/b";' },
                b: { "plugin.ts": declares("b", ["a"]), "use.ts": 'import { a } from "@plugins/a";' },
            }),
        );

        const cycle = found.find((one) => one.rule === "cycle");

        expect(cycle?.message).toMatch(/a -> b -> a|b -> a -> b/);
    });

    test("a one-way dependency is not a cycle", () =>
    {
        const found = boundaries(
            tree({
                auth: { "plugin.ts": declares("auth") },
                demo: { "plugin.ts": declares("demo", ["auth"]), "use.ts": 'import { auth } from "@plugins/auth";' },
            }),
        );

        expect(found.filter((one) => one.rule === "cycle")).toEqual([]);
    });
});
