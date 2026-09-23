import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";

import { createKernel } from "../../index";
import type { Plugin } from "../../index";
import { Project } from "../project";

const bin = join(process.cwd(), "bin", "stack-app-kit.mjs");
const made: string[] = [];

afterEach(() =>
{
    for (const folder of made.splice(0))
    {
        rmSync(folder, { recursive: true, force: true });
    }
});

function project(): string
{
    const root = mkdtempSync(join(tmpdir(), "kit-generator-"));

    made.push(root);
    mkdirSync(join(root, "src", "plugins"), { recursive: true });

    return root;
}

function run(root: string, ...args: string[]): { status: number; output: string }
{
    try
    {
        return { status: 0, output: execFileSync("node", [bin, ...args], { cwd: root, encoding: "utf8", stdio: "pipe" }) };
    }
    catch (error)
    {
        const failed = error as { status: number; stderr: string };

        return { status: failed.status, output: failed.stderr };
    }
}

describe("new plugin", () =>
{
    test("writes the contract, the public entry, usage.md and one test that it starts, and nothing else", () =>
    {
        const root = project();

        const result = run(root, "new", "plugin", "order-history");
        const folder = join(root, "src", "plugins", "order-history");

        expect(result.status).toBe(0);
        expect(readFileSync(join(folder, "plugin.ts"), "utf8")).toContain("export default definePlugin(\"order-history\", {");
        expect(readFileSync(join(folder, "index.ts"), "utf8")).toBe("export const OrderHistory = {};\n");
        expect(readFileSync(join(folder, "usage.md"), "utf8")).toMatch(/^# order-history\n\n## Description/);
        expect(readFileSync(join(folder, "tests", "orderHistory.test.ts"), "utf8")).toContain("await kernel.start();");
    });

    test("writes a plugin the kernel starts as it is", async () =>
    {
        const root = project();
        run(root, "new", "plugin", "items");

        const written = await import(join(root, "src", "plugins", "items", "plugin.ts")) as { default: Plugin };
        const kernel = createKernel({ plugins: [written.default] });
        await kernel.start();

        expect(kernel.started()).toBe(true);
    });

    test("leaves warnings until every placeholder is filled", () =>
    {
        const root = project();

        run(root, "new", "plugin", "items");

        expect(Project.findWarnings({ root }).filter((warning) => warning.check === "unfinished")).toHaveLength(2);
    });

    test("refuses a name that is no plugin name, and a folder that exists, writing nothing", () =>
    {
        const root = project();
        mkdirSync(join(root, "src", "plugins", "items"));

        const badName = run(root, "new", "plugin", "Items_2");
        const taken = run(root, "new", "plugin", "items");

        expect(badName).toMatchObject({ status: 1, output: expect.stringContaining("is not a plugin name") });
        expect(taken).toMatchObject({ status: 1, output: expect.stringContaining("already exists") });
        expect(existsSync(join(root, "src", "plugins", "Items_2"))).toBe(false);
        expect(existsSync(join(root, "src", "plugins", "items", "plugin.ts"))).toBe(false);
    });
});
