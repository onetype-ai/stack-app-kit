import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";

import { Browsers, Hosts, Stack } from "../node/index";

const folders: string[] = [];
const closing: (() => Promise<void>)[] = [];

afterEach(async () =>
{
    for (const close of closing.splice(0))
    {
        await close();
    }

    for (const made of folders.splice(0))
    {
        rmSync(made, { recursive: true, force: true });
    }
});

function lockPath(): string
{
    const made = mkdtempSync(join(tmpdir(), "stack-e2e-lock-"));

    folders.push(made);

    return join(made, "browser.lock");
}

describe("a watched page", () =>
{
    test("records a console error, an uncaught throw and a 5xx, one sentence each", async () =>
    {
        const [port] = await Stack.freePorts(1);
        const hosts = await Hosts.start({ port: port ?? 0, pages: {
            "/": "<script>console.error('broken'); fetch('/missing-api'); setTimeout(() => { throw new Error('late') });</script>",
        } });
        closing.push(hosts.close);
        const browser = await Browsers.launch({ lockPath: lockPath() });
        closing.push(browser.close);

        const { page, problems } = await browser.open();
        await page.goto(hosts.origin());
        await page.waitForTimeout(300);

        expect(problems).toEqual(expect.arrayContaining(["console: broken", "threw: late"]));
    }, 60_000);
});

describe("the browser lock", () =>
{
    test("lets one browser run at a time, and frees itself on close", async () =>
    {
        const path = lockPath();
        const first = await Browsers.launch({ lockPath: path });

        await expect(Browsers.launch({ lockPath: path, lockWaitMs: 300 })).rejects.toMatchObject({ code: "LOCKED" });
        await first.close();

        const second = await Browsers.launch({ lockPath: path, lockWaitMs: 300 });
        await second.close();
    }, 60_000);
});
