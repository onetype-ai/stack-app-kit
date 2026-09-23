import type { ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { composeEnv } from "./env";
import { refuseTaken } from "./ports";
import { spawnService, stopGroup } from "./processes";
import { waitReady } from "./ready";

/** One service of the application under test. */
export type ServiceOptions = {
    folder: string;
    command: readonly string[];

    /** Fixed and strict: a taken port is refused, never moved. */
    port: number;

    /** The path answering 2xx once the service can serve (`/ready`, not `/health`); `/` when left out. */
    ready?: string | undefined;

    /** The only environment the service sees besides PATH, HOME, TMPDIR, LANG; `{name}` becomes that service's origin. */
    env?: Readonly<Record<string, string>> | undefined;
};

/** What `Stack.start` takes: every service by name, and how long each may take to become ready. */
export type StackOptions = {
    services: Readonly<Record<string, ServiceOptions>>;
    readyMs?: number | undefined;

    /** How long a service has after SIGTERM before its group gets SIGKILL (5 s by default). */
    stopGraceMs?: number | undefined;
};

/** A started stack: each service's origin, the folder holding their logs, and the stop that ends only them. */
export type RunningStack = {
    origins: Readonly<Record<string, string>>;
    folder: string;
    stop: () => Promise<void>;
};

export async function startStack(options: StackOptions): Promise<RunningStack>
{
    const entries = Object.entries(options.services);

    await refuseTaken(entries.map(([, service]) => service.port));

    const folder = mkdtempSync(join(tmpdir(), "stack-e2e-"));
    const origins = Object.fromEntries(entries.map(([name, service]) => [name, `http://127.0.0.1:${String(service.port)}`]));
    const started: ChildProcess[] = [];
    const stop = async (): Promise<void> =>
    {
        await Promise.all(started.map((child) => stopGroup(child, options.stopGraceMs)));
        rmSync(folder, { recursive: true, force: true });
    };

    try
    {
        for (const [name, service] of entries)
        {
            const log = join(folder, `${name}.log`);
            const child = spawnService(name, service.folder, service.command, composeEnv(service.env ?? {}, origins), log);

            started.push(child);
            await waitReady(name, `${origins[name] ?? ""}${service.ready ?? "/"}`, child, log, options.readyMs ?? 30_000);
        }
    }
    catch (cause)
    {
        await stop();

        throw cause;
    }

    return { origins, folder, stop };
}
