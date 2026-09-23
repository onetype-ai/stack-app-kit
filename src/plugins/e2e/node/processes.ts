import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { createWriteStream } from "node:fs";
import { setTimeout as wait } from "node:timers/promises";

import { E2eFault } from "./faults";

export function spawnService(name: string, folder: string, command: readonly string[], env: Readonly<Record<string, string>>, log: string): ChildProcess
{
    const [program, ...rest] = command;

    if (program === undefined)
    {
        throw new E2eFault("NO_COMMAND", `e2e: service "${name}" was given no command. Pass command: ["pnpm", "dev"].`);
    }

    const output = createWriteStream(log);
    const child = spawn(program, rest, { cwd: folder, env, stdio: ["ignore", "pipe", "pipe"], detached: true });

    child.stdout?.pipe(output);
    child.stderr?.pipe(output);

    return child;
}

export async function stopGroup(child: ChildProcess, graceMs = 5_000): Promise<void>
{
    if (child.pid === undefined || child.exitCode !== null || child.signalCode !== null)
    {
        return;
    }

    const exited = new Promise<boolean>((done) =>
    {
        child.once("exit", () =>
        {
            done(true);
        });
    });

    try
    {
        process.kill(-child.pid, "SIGTERM");
    }
    catch
    {
        return;
    }

    const stopped = await Promise.race([exited, wait(graceMs).then(() => false)]);

    if (!stopped)
    {
        try
        {
            process.kill(-child.pid, "SIGKILL");
        }
        catch
        {
            return;
        }

        await exited;
    }
}
