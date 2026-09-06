import { describe, expect, test } from "vitest";

import { boot } from "../boot";
import { Fault } from "../errors";
import type { Host } from "../host";
import type { Plugin } from "../plugin";

const quiet = (): void => {};

/** A plugin that records the order it booted in, and nothing else. */
function createPlugin(name: string, needs: readonly string[] = [], into: string[] = []): Plugin
{
    return {
        name,
        needs,
        boot: () =>
        {
            into.push(name);
        },
    };
}

describe("boot order", () =>
{
    test("boots a plugin after the ones it needs", () =>
    {
        const booted: string[] = [];

        boot(quiet, [
            createPlugin("vmm", ["jail", "storage"], booted),
            createPlugin("storage", [], booted),
            createPlugin("jail", ["storage"], booted),
        ]);

        expect(booted).toEqual(["storage", "jail", "vmm"]);
    });

    test("breaks ties by name, so one set is always one order", () =>
    {
        const first: string[] = [];
        const second: string[] = [];

        boot(quiet, [createPlugin("b", [], first), createPlugin("a", [], first), createPlugin("c", [], first)]);
        boot(quiet, [createPlugin("c", [], second), createPlugin("b", [], second), createPlugin("a", [], second)]);

        expect(first).toEqual(second);
    });

    test("refuses a cycle, naming both plugins", () =>
    {
        const failed = (): unknown => boot(quiet, [createPlugin("a", ["b"]), createPlugin("b", ["a"])]);

        expect(failed).toThrow(Fault);
        expect(failed).toThrow(/a -> b -> a|b -> a -> b/);
    });

    test("refuses a plugin needing itself", () =>
    {
        expect(() => boot(quiet, [createPlugin("a", ["a"])])).toThrow(/needs itself/);
    });

    test("refuses a need no plugin provides, naming it", () =>
    {
        expect(() => boot(quiet, [createPlugin("a", ["missing"])])).toThrow(/no plugin provides "missing"/);
    });

    test("refuses the same name twice", () =>
    {
        expect(() => boot(quiet, [createPlugin("a"), createPlugin("a")])).toThrow(/given twice/);
    });
});

describe("start and stop", () =>
{
    test("starts in boot order and stops in reverse", async () =>
    {
        const seen: string[] = [];
        const watched = (name: string, needs: readonly string[] = []): Plugin => ({
            name,
            needs,
            boot: () => {},
            start: () =>
            {
                seen.push(`start ${name}`);
            },
            stop: () =>
            {
                seen.push(`stop ${name}`);
            },
        });

        const booted = boot(quiet, [watched("second", ["first"]), watched("first")]);

        await booted.start();
        await booted.stop();

        expect(seen).toEqual(["start first", "start second", "stop second", "stop first"]);
    });

    test("a start that throws stops what already started", async () =>
    {
        const seen: string[] = [];
        const booted = boot(quiet, [
            {
                name: "first",
                boot: () => {},
                stop: () =>
                {
                    seen.push("stop first");
                },
            },
            {
                name: "second",
                needs: ["first"],
                boot: () => {},
                start: () =>
                {
                    throw new Error("no socket");
                },
            },
        ]);

        await expect(booted.start()).rejects.toThrow("no socket");

        expect(seen).toEqual(["stop first"]);
    });

    test("a stop that throws does not strand the plugins behind it", async () =>
    {
        const seen: string[] = [];
        const booted = boot(quiet, [
            {
                name: "first",
                boot: () => {},
                start: () => {},
                stop: () =>
                {
                    seen.push("stop first");
                },
            },
            {
                name: "second",
                needs: ["first"],
                boot: () => {},
                start: () => {},
                stop: () =>
                {
                    throw new Error("stuck");
                },
            },
        ]);

        await booted.start();
        await booted.stop();

        expect(seen).toEqual(["stop first"]);
    });
});

describe("what a plugin may do", () =>
{
    test("takes the api a plugin it needs offered", () =>
    {
        let taken: unknown;

        boot(quiet, [
            { name: "storage", boot: (host: Host) => host.offer("storage", { size: 8 }) },
            {
                name: "vmm",
                needs: ["storage"],
                boot: (host: Host) =>
                {
                    taken = host.take("storage");
                },
            },
        ]);

        expect(taken).toEqual({ size: 8 });
    });

    test("refuses a second offer under one name, naming the first owner", () =>
    {
        const failed = (): unknown =>
            boot(quiet, [
                { name: "a", boot: (host: Host) => host.offer("same", {}) },
                { name: "b", needs: ["a"], boot: (host: Host) => host.offer("same", {}) },
            ]);

        expect(failed).toThrow(/already offered by "a"/);
    });

    test("refuses an offer after boot", () =>
    {
        const booted = boot(quiet, [{ name: "a", boot: () => {} }]);

        expect(() => booted.host.as("a").offer("late", {})).toThrow(/after boot/);
    });

    test("refuses a subscription after boot", () =>
    {
        const booted = boot(quiet, [{ name: "a", boot: () => {} }]);

        expect(() => booted.host.as("a").on("late", () => {})).toThrow(/after boot/);
    });
});

describe("events", () =>
{
    test("delivers to every listener but the one that emitted", () =>
    {
        const heard: string[] = [];
        const booted = boot(quiet, [
            {
                name: "a",
                boot: (host: Host) =>
                    host.on("thing.happened", () =>
                    {
                        heard.push("a");
                    }),
            },
            {
                name: "b",
                boot: (host: Host) =>
                    host.on("thing.happened", () =>
                    {
                        heard.push("b");
                    }),
            },
        ]);

        booted.host.as("a").emit("thing.happened", {});

        expect(heard).toEqual(["b"]);
    });

    test("a listener that throws reaches neither the emitter nor the others", () =>
    {
        const heard: string[] = [];
        const said: string[] = [];
        const booted = boot((line) => said.push(line), [
            {
                name: "a",
                boot: (host: Host) =>
                    host.on("thing.happened", () =>
                    {
                        throw new Error("bad listener");
                    }),
            },
            {
                name: "b",
                boot: (host: Host) =>
                    host.on("thing.happened", () =>
                    {
                        heard.push("b");
                    }),
            },
        ]);

        expect(() => booted.host.emit("thing.happened", {})).not.toThrow();

        expect(heard).toEqual(["b"]);
        expect(said.some((line) => line.includes("threw"))).toBe(true);
    });
});
