import { describe, expect, test } from "vitest";
import { z } from "zod";

import { createKernel, definePlugin } from "../api";

import type { HttpClient, Plugin, Realtime } from "../api";

const Tool = z.object({ name: z.string(), label: z.string() });

const tools = definePlugin("tools", {
    version: "1.0.0",
    describe: "Shows the tools the server offers.",
    registries: { "tools.available": { describe: "Tools this viewer may use.", entry: Tool, key: "name", remote: "tools.available" } },
});

const announcer = definePlugin("transport", {
    version: "1.0.0",
    describe: "Announces the socket.",
    emits: { "transport.reconnected": { describe: "The socket is back.", schema: z.object({ downMs: z.number() }) } },
});

function serving(first: unknown)
{
    const asked: string[] = [];
    const pending: ((body: unknown) => void)[] = [];
    const channels = new Map<string, (message: unknown) => void>();
    let answer: unknown = first;
    let holding = false;

    const http = {
        get: (path: string) =>
        {
            asked.push(path);

            return holding ? new Promise((resolve) => pending.push(resolve)) : Promise.resolve(answer);
        },
    } as unknown as HttpClient;

    const realtime: Realtime = {
        channel: () => "ws",
        subscribe: (topic, receive) =>
        {
            channels.set(topic, receive);

            return { close: () => channels.delete(topic) };
        },
        reconnect: () => {},
    };

    return {
        http,
        realtime,
        asked,
        channels,
        answers: (next: unknown): void =>
        {
            answer = next;
        },
        hold: (): void =>
        {
            holding = true;
        },
        release: (body: unknown, which: "oldest" | "newest" = "oldest"): void =>
        {
            holding = false;
            (which === "oldest" ? pending.shift() : pending.pop())?.(body);
        },
        push: (message: unknown): void =>
        {
            channels.get("registry.tools.available")?.(message);
        },
    };
}

const settled = () => new Promise((resolve) => setTimeout(resolve, 0));

async function mirrored(server: ReturnType<typeof serving>, plugins: Plugin[] = [tools], log?: (line: string) => void)
{
    const kernel = createKernel({ plugins, http: server.http, realtime: server.realtime, ...(log !== undefined && { log: (_level, _plugin, line) => log(line) }) });

    await kernel.start();
    await settled();

    return kernel;
}

const names = (kernel: Awaited<ReturnType<typeof mirrored>>) => kernel.registry("tools.available").list().map((entry) => entry["name"]);

describe("a registry mirroring the server", () =>
{
    test("starts from the snapshot and applies each next push, ignoring an old one", async () =>
    {
        const server = serving({ version: 1, entries: [{ name: "search", label: "Search" }] });
        const kernel = await mirrored(server);

        server.push({ version: 2, op: "set", key: "mail", entry: { name: "mail", label: "Mail" } });
        server.push({ version: 3, op: "remove", key: "search" });
        server.push({ version: 2, op: "set", key: "search", entry: { name: "search", label: "Search" } });

        expect(server.asked).toEqual(["/registries/tools.available"]);
        expect(names(kernel)).toEqual(["mail"]);
    });

    test("reads the snapshot again after a missed push, since the socket never replays it", async () =>
    {
        const server = serving({ version: 1, entries: [] });
        const kernel = await mirrored(server);
        server.answers({ version: 5, entries: [{ name: "mail", label: "Mail" }] });

        server.push({ version: 4, op: "set", key: "late", entry: { name: "late", label: "Late" } });
        await settled();

        expect(server.asked).toHaveLength(2);
        expect(names(kernel)).toEqual(["mail"]);
    });

    test("drops an entry its schema refuses, and says so", async () =>
    {
        const said: string[] = [];
        const server = serving({ version: 1, entries: [{ name: "search", label: "Search" }, { name: "broken" }] });

        const kernel = await mirrored(server, [tools], (line) => said.push(line));

        expect(names(kernel)).toEqual(["search"]);
        expect(said).toContain("registry \"tools.available\" dropped 1 entries its schema refuses");
    });

    test("forgets everything on a session change before the next identity reads, and ignores the old identity's late answer", async () =>
    {
        const server = serving({ version: 1, entries: [{ name: "admin", label: "Admin" }] });
        const kernel = await mirrored(server);
        server.hold();
        server.push({ version: 3, op: "set", key: "x", entry: { name: "x", label: "X" } });

        kernel.context("tools").session.changed();
        const rightAfter = names(kernel);
        server.release({ version: 1, entries: [{ name: "search", label: "Search" }] }, "newest");
        server.release({ version: 2, entries: [{ name: "admin", label: "Admin" }] });
        await settled();

        expect(server.asked).toHaveLength(3);
        expect(rightAfter).toEqual([]);
        expect(names(kernel)).toEqual(["search"]);
    });

    test("reads the snapshot again once the socket is back", async () =>
    {
        const server = serving({ version: 1, entries: [] });
        const kernel = await mirrored(server, [announcer, tools]);

        kernel.context("transport").events.emit("transport.reconnected", { downMs: 10 });
        await settled();

        expect(server.asked).toHaveLength(2);
    });

    test("refuses an entry added here, since only the server adds to it", async () =>
    {
        const server = serving({ version: 1, entries: [] });
        const kernel = await mirrored(server);

        expect(() => kernel.context("tools").registry("tools.available").set({ name: "x", label: "X" })).toThrow(/fed by the server's "tools.available", so only the server adds to it/);
    });

    test("stops hearing pushes once the kernel stops", async () =>
    {
        const server = serving({ version: 1, entries: [] });
        const kernel = await mirrored(server);

        await kernel.stop();

        expect(server.channels.size).toBe(0);
    });
});
