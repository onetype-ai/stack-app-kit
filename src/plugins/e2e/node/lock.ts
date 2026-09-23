import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as wait } from "node:timers/promises";

import { E2eFault } from "./faults";

export const defaultLockPath = join(tmpdir(), "stack-e2e-browser.lock");

function isAlive(pid: number): boolean
{
    try
    {
        process.kill(pid, 0);

        return true;
    }
    catch
    {
        return false;
    }
}

function tryTake(path: string): boolean
{
    try
    {
        mkdirSync(path);
        writeFileSync(join(path, "pid"), String(process.pid));

        return true;
    }
    catch
    {
        const holder = Number(readFileSafe(join(path, "pid")));

        if (!Number.isInteger(holder) || holder <= 0 || !isAlive(holder))
        {
            rmSync(path, { recursive: true, force: true });

            return false;
        }

        return false;
    }
}

function readFileSafe(file: string): string
{
    try
    {
        return readFileSync(file, "utf8");
    }
    catch
    {
        return "";
    }
}

export async function takeLock(path: string, waitMs: number): Promise<() => void>
{
    const deadline = Date.now() + waitMs;

    while (!tryTake(path))
    {
        if (Date.now() > deadline)
        {
            throw new E2eFault("LOCKED", `e2e: another browser run holds ${path} (pid ${readFileSafe(join(path, "pid")) || "unknown"}). Wait for it, or pass another lockPath.`);
        }

        await wait(500);
    }

    return () =>
    {
        if (readFileSafe(join(path, "pid")) === String(process.pid))
        {
            rmSync(path, { recursive: true, force: true });
        }
    };
}
