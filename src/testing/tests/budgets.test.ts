import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";

import { Project } from "../project";

const made: string[] = [];

afterEach(() =>
{
    for (const folder of made.splice(0))
    {
        rmSync(folder, { recursive: true, force: true });
    }
});

const lines = (count: number): string => Array.from({ length: count }, (_, at) => `export const line${String(at)} = ${String(at)};`).join("\n");

function project(files: Record<string, string>): string
{
    const root = mkdtempSync(join(tmpdir(), "kit-budgets-"));

    made.push(root);

    for (const [path, source] of Object.entries(files))
    {
        mkdirSync(dirname(join(root, path)), { recursive: true });
        writeFileSync(join(root, path), source);
    }

    return root;
}

const warned = (root: string, check: string, options: Parameters<typeof Project.findWarnings>[0] = {}) =>
    Project.findWarnings({ root, ...options }).filter((warning) => warning.check === check).map((warning) => warning.message);

describe("budgets a project is warned about, never refused, in 6.x", () =>
{
    test("a source file past 500 lines, naming it and its size; a long test file is not one", () =>
    {
        const root = project({
            "src/plugins/items/services/list.ts": lines(501),
            "src/plugins/items/services/small.ts": lines(500),
            "src/plugins/items/tests/items.test.ts": lines(900),
        });

        expect(warned(root, "size")).toEqual(["src/plugins/items/services/list.ts is 501 lines, past 500: split it by the ideas it holds."]);
    });

    test("a plugin whose test lines pass its code by more than 10%", () =>
    {
        const root = project({
            "src/plugins/items/plugin.ts": lines(100),
            "src/plugins/items/tests/items.test.ts": lines(111),
            "src/plugins/notes/plugin.ts": lines(100),
            "src/plugins/notes/tests/notes.test.ts": lines(110),
        });

        expect(warned(root, "tests")).toEqual(["items holds 111 test lines for 100 lines of code, past 110%: prove each guarantee once, through the public entry."]);
    });

    test("a test file taking over a tenth of the suite's time, read from a vitest report when one is given", () =>
    {
        const root = project({
            "report.json": JSON.stringify({ testResults: [
                { name: "/x/src/plugins/items/tests/slow.test.ts", startTime: 0, endTime: 500 },
                ...Array.from({ length: 9 }, (_, at) => ({ name: `/x/fast${String(at)}.test.ts`, startTime: 0, endTime: 50 })),
            ] }),
        });

        const slow = warned(root, "slow", { testReport: join(root, "report.json") });

        expect(slow).toEqual(["/x/src/plugins/items/tests/slow.test.ts takes 53% of the suite's time, past 10%: fake its clock or its world, or tag it slow."]);
        expect(warned(root, "slow")).toEqual([]);
    });

    test("each limit is the project's to move", () =>
    {
        const root = project({ "src/plugins/items/plugin.ts": lines(300), "src/plugins/items/tests/items.test.ts": lines(400) });

        expect(warned(root, "size", { maxLines: 200 })).toHaveLength(1);
        expect(warned(root, "tests", { maxTestRatio: 2 })).toEqual([]);
    });
});
