import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";

import { findImportViolations, findShadowedExports, findSharedNames, findSharedVocabulary } from "../boundaries";

let root = "";

afterEach(() =>
{
    if (root !== "")
    {
        rmSync(root, { recursive: true, force: true });
        root = "";
    }
});

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

const contractFor = (name: string, needs: readonly string[] = []): string =>
    `export default definePlugin("${name}", { dependsOn: [${needs.map((need) => `"${need}"`).join(", ")}] });`;

describe("a plugin reaching another", () =>
{
    test("passes when it is declared and goes through the public index", () =>
    {
        const violations = findImportViolations(
            tree({
                auth: { "plugin.ts": contractFor("auth") },
                demo: {
                    "plugin.ts": contractFor("demo", ["auth"]),
                    "services/items.ts": 'import { useAuth } from "@plugins/auth";',
                },
            }),
        );

        expect(violations).toEqual([]);
    });

    test("refuses an import nothing declared", () =>
    {
        const violations = findImportViolations(
            tree({
                auth: { "plugin.ts": contractFor("auth") },
                demo: {
                    "plugin.ts": contractFor("demo"),
                    "services/items.ts": 'import { useAuth } from "@plugins/auth";',
                },
            }),
        );

        expect(violations.map((violation) => violation.rule)).toContain("undeclared");
        expect(violations[0]?.message).toMatch(/without declaring "auth"/);
    });

    test("refuses a reach past the public index", () =>
    {
        const violations = findImportViolations(
            tree({
                auth: { "plugin.ts": contractFor("auth") },
                demo: {
                    "plugin.ts": contractFor("demo", ["auth"]),
                    "services/items.ts": 'import { Session } from "@plugins/auth/types/Session";',
                },
            }),
        );

        expect(violations.map((violation) => violation.rule)).toContain("deep");
    });

    test("refuses a relative path that climbs into another plugin", () =>
    {
        const violations = findImportViolations(
            tree({
                auth: { "plugin.ts": contractFor("auth"), "types/Session.ts": "export type Session = { id: string };" },
                demo: {
                    "plugin.ts": contractFor("demo", ["auth"]),
                    "services/items.ts": 'import type { Session } from "../../auth/types/Session";',
                },
            }),
        );

        expect(violations.map((violation) => violation.rule)).toContain("deep");
        expect(violations.some((violation) => violation.message.includes("../../auth/types/Session"))).toBe(true);
    });

    test("ignores a relative import inside one plugin", () =>
    {
        const violations = findImportViolations(
            tree({
                demo: {
                    "plugin.ts": contractFor("demo"),
                    "services/items.ts": 'import { DemoItem } from "../types/DemoItem";',
                    "types/DemoItem.ts": "export type DemoItem = { id: string };",
                },
            }),
        );

        expect(violations).toEqual([]);
    });
});

describe("cycles", () =>
{
    test("names a loop between two plugins", () =>
    {
        const violations = findImportViolations(
            tree({
                a: { "plugin.ts": contractFor("a", ["b"]), "use.ts": 'import { b } from "@plugins/b";' },
                b: { "plugin.ts": contractFor("b", ["a"]), "use.ts": 'import { a } from "@plugins/a";' },
            }),
        );

        const cycle = violations.find((violation) => violation.rule === "cycle");

        expect(cycle?.message).toMatch(/a -> b -> a|b -> a -> b/);
    });

    test("a one-way dependency is not a cycle", () =>
    {
        const violations = findImportViolations(
            tree({
                auth: { "plugin.ts": contractFor("auth") },
                demo: { "plugin.ts": contractFor("demo", ["auth"]), "use.ts": 'import { auth } from "@plugins/auth";' },
            }),
        );

        expect(violations.filter((violation) => violation.rule === "cycle")).toEqual([]);
    });
});

describe("an import the pattern used to miss", () =>
{
    test("is caught when it is written with single quotes", () =>
    {
        const violations = findImportViolations(
            tree({
                auth: { "plugin.ts": contractFor("auth") },
                demo: {
                    "plugin.ts": contractFor("demo"),
                    "use.ts": "import { thing } from '@plugins/auth';",
                },
            }),
        );

        expect(violations.map((violation) => violation.rule)).toContain("undeclared");
    });

    test("and when it is a dynamic import", () =>
    {
        const violations = findImportViolations(
            tree({
                auth: { "plugin.ts": contractFor("auth") },
                demo: {
                    "plugin.ts": contractFor("demo"),
                    "use.ts": 'const late = () => import("@plugins/auth");',
                },
            }),
        );

        expect(violations.map((violation) => violation.rule)).toContain("undeclared");
    });

    test("and when it reaches past the index with single quotes", () =>
    {
        const violations = findImportViolations(
            tree({
                auth: { "plugin.ts": contractFor("auth") },
                demo: {
                    "plugin.ts": contractFor("demo", ["auth"]),
                    "use.ts": "import { Session } from '@plugins/auth/types/Session';",
                },
            }),
        );

        expect(violations.map((violation) => violation.rule)).toContain("deep");
    });
});

describe("a plugin's own tests", () =>
{
    test("may reach a plugin it does not depend on, since a test is not shipped code", () =>
    {
        const at = tree({
            shell: { "plugin.ts": contractFor("shell"), "tests/whole.test.ts": `import { Billing } from "@plugins/billing";` },
            billing: { "plugin.ts": contractFor("billing"), "index.ts": "export const Billing = {};" },
        });

        expect(findImportViolations(at)).toEqual([]);
    });

    test("and may reach another's contract, which is how a slot is proved to be filled", () =>
    {
        const at = tree({
            shell: { "plugin.ts": contractFor("shell"), "tests/slot.test.ts": `import billing from "@plugins/billing/plugin";` },
            billing: { "plugin.ts": contractFor("billing") },
        });

        expect(findImportViolations(at)).toEqual([]);
    });

    test("while the plugin itself is still held to what it declared", () =>
    {
        const at = tree({
            shell: { "plugin.ts": contractFor("shell"), "sections/Bar.tsx": `import { Billing } from "@plugins/billing";` },
            billing: { "plugin.ts": contractFor("billing"), "index.ts": "export const Billing = {};" },
        });

        expect(findImportViolations(at)).toHaveLength(1);
    });
});

describe("a util two plugins each wrote", () =>
{
    const util = (name: string, signature: string, body: string): string =>
        `class ${name}\n{\n    ${signature}\n    {\n        ${body}\n    }\n}\n\nexport const ${name} = new ${name}();\n`;

    test("is named when the signature is written in two plugins, however differently", () =>
    {
        const shared = findSharedNames(
            tree({
                one: { "plugin.ts": contractFor("one"), "utils/Text.ts": util("T", "searchable(raw: string): string", "return raw.toLowerCase();") },
                two: { "plugin.ts": contractFor("two"), "utils/Words.ts": util("W", "searchable(raw: string): string", "return raw.normalize(\"NFD\");") },
            }),
        );

        expect(shared).toHaveLength(1);
        expect(shared[0]?.signature).toBe("searchable(raw: string): string");
        expect(shared[0]?.plugins).toEqual(["one", "two"]);
    });

    test("a signature one plugin alone writes is nobody's business", () =>
    {
        const shared = findSharedNames(
            tree({
                one: { "plugin.ts": contractFor("one"), "utils/Text.ts": util("T", "searchable(raw: string): string", "return raw;") },
                two: { "plugin.ts": contractFor("two"), "utils/Sums.ts": util("S", "total(of: readonly number[]): number", "return 0;") },
            }),
        );

        expect(shared).toEqual([]);
    });

    test("two answering different questions are held apart by their own types, with nothing to declare", () =>
    {
        const shared = findSharedNames(
            tree({
                one: { "plugin.ts": contractFor("one"), "utils/A.ts": util("A", "rank(role: string): number", "return 0;") },
                two: { "plugin.ts": contractFor("two"), "utils/B.ts": util("B", "rank(score: readonly number[]): number", "return 0;") },
            }),
        );

        expect(shared).toEqual([]);
    });

    test("only utils are read: a service is meant to know its own domain", () =>
    {
        const shared = findSharedNames(
            tree({
                one: { "plugin.ts": contractFor("one"), "services/Items.ts": util("I", "listed(of: string): string", "return of;") },
                two: { "plugin.ts": contractFor("two"), "services/Rows.ts": util("R", "listed(of: string): string", "return of;") },
            }),
        );

        expect(shared).toEqual([]);
    });

    test("one plugin writing the same signature twice is its own affair", () =>
    {
        const shared = findSharedNames(
            tree({
                one: {
                    "plugin.ts": contractFor("one"),
                    "utils/A.ts": util("A", "of(raw: string): string", "return raw;"),
                    "utils/B.ts": util("B", "of(raw: string): string", "return raw;"),
                },
            }),
        );

        expect(shared).toEqual([]);
    });
});

describe("a vocabulary two plugins each wrote out", () =>
{
    const enumOf = (name: string, members: readonly string[]): string =>
        `import { z } from "zod";\n\nexport const ${name} = z.enum([${members.map((one) => `"${one}"`).join(", ")}]);\n\nexport type ${name} = z.infer<typeof ${name}>;\n`;

    test("is named when both the name and the members match", () =>
    {
        const shared = findSharedVocabulary(
            tree({
                one: { "plugin.ts": contractFor("one"), "types/Role.ts": enumOf("Role", ["owner", "member"]) },
                two: { "plugin.ts": contractFor("two"), "types/Seat.ts": enumOf("Role", ["member", "owner"]) },
            }),
        );

        expect(shared).toHaveLength(1);
        expect(shared[0]?.signature).toBe("Role = [member, owner]");
        expect(shared[0]?.plugins).toEqual(["one", "two"]);
    });

    test("the same name over a different set is two concepts sharing a word", () =>
    {
        const shared = findSharedVocabulary(
            tree({
                one: { "plugin.ts": contractFor("one"), "types/Role.ts": enumOf("Role", ["owner", "member"]) },
                two: { "plugin.ts": contractFor("two"), "types/Seat.ts": enumOf("Role", ["visitor", "bot"]) },
            }),
        );

        expect(shared).toEqual([]);
    });

    test("the same set under different names is a rename, not a drift", () =>
    {
        const shared = findSharedVocabulary(
            tree({
                one: { "plugin.ts": contractFor("one"), "types/Plan.ts": enumOf("Plan", ["solo", "studio"]) },
                two: { "plugin.ts": contractFor("two"), "types/Tier.ts": enumOf("Tier", ["solo", "studio"]) },
            }),
        );

        expect(shared).toEqual([]);
    });

    test("one plugin writing it twice is its own business", () =>
    {
        const shared = findSharedVocabulary(
            tree({
                one: {
                    "plugin.ts": contractFor("one"),
                    "types/Role.ts": enumOf("Role", ["owner", "member"]),
                    "types/Seat.ts": enumOf("Role", ["owner", "member"]),
                },
            }),
        );

        expect(shared).toEqual([]);
    });
});

describe("a component a plugin wrote for itself", () =>
{
    test("is named when one it depends on exports that name", () =>
    {
        const shadowed = findShadowedExports(
            tree({
                admin: {
                    "plugin.ts": contractFor("admin"),
                    "index.ts": `export { Badge } from "./components/Badge/Badge";`,
                    "components/Badge/Badge.tsx": "export const Badge = () => null;",
                },
                studio: {
                    "plugin.ts": contractFor("studio", ["admin"]),
                    "components/Badge/Badge.tsx": "export const Badge = () => null;",
                },
            }),
        );

        expect(shadowed).toHaveLength(1);
        expect(shadowed[0]).toMatchObject({ plugin: "studio", component: "Badge", owner: "admin" });
    });

    test("is left alone when nothing it depends on exports that name", () =>
    {
        // Two plugins may hold the same word without either reaching the
        // other: the check is about a copy of something already in hand.
        const shadowed = findShadowedExports(
            tree({
                admin: {
                    "plugin.ts": contractFor("admin"),
                    "index.ts": `export { Badge } from "./components/Badge/Badge";`,
                    "components/Badge/Badge.tsx": "export const Badge = () => null;",
                },
                studio: {
                    "plugin.ts": contractFor("studio"),
                    "components/Badge/Badge.tsx": "export const Badge = () => null;",
                },
            }),
        );

        expect(shadowed).toEqual([]);
    });

    test("and a name the owner keeps to itself is nobody's business", () =>
    {
        const shadowed = findShadowedExports(
            tree({
                admin: {
                    "plugin.ts": contractFor("admin"),
                    "index.ts": `export { Panel } from "./components/Panel/Panel";`,
                    "components/Badge/Badge.tsx": "export const Badge = () => null;",
                },
                studio: {
                    "plugin.ts": contractFor("studio", ["admin"]),
                    "components/Badge/Badge.tsx": "export const Badge = () => null;",
                },
            }),
        );

        expect(shadowed).toEqual([]);
    });
});
