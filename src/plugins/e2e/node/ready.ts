import type { ChildProcess } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { setTimeout as wait } from "node:timers/promises";

import { E2eFault } from "./faults";

function tailOf(log: string, lines = 40): string
{
    return existsSync(log) ? readFileSync(log, "utf8").split("\n").slice(-lines).join("\n") : "(no output)";
}

async function answers(url: string): Promise<boolean>
{
    try
    {
        const response = await fetch(url, { signal: AbortSignal.timeout(2_000) });

        return response.ok;
    }
    catch
    {
        return false;
    }
}

export async function waitReady(name: string, url: string, child: ChildProcess, log: string, deadlineMs: number): Promise<void>
{
    const deadline = Date.now() + deadlineMs;

    while (Date.now() < deadline)
    {
        if (child.exitCode !== null)
        {
            throw new E2eFault("NOT_READY", `e2e: "${name}" exited with ${String(child.exitCode)} before ${url} answered. Its output:\n${tailOf(log)}`);
        }

        if (await answers(url))
        {
            return;
        }

        await wait(250);
    }

    throw new E2eFault("NOT_READY", `e2e: "${name}" did not answer ${url} within ${String(deadlineMs)} ms. Its output:\n${tailOf(log)}`);
}
