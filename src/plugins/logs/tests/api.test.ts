import { afterEach, describe, expect, test, vi } from "vitest";

import { captureErrors, create, postTo, shipper } from "../api";
import type { LogEntry, ShippedEntry, ShipperOptions } from "../api";

afterEach(() =>
{
    vi.unstubAllGlobals();
});

const fixedNow = (): Date => new Date("2026-01-01T00:00:00.000Z");

function entry(level: LogEntry["level"], line: string, about?: Record<string, unknown>, plugin = "items"): LogEntry
{
    return { level, at: "2026-01-01T00:00:00.000Z", plugin, line, about };
}

function shipping(options: Partial<ShipperOptions> = {})
{
    const sent: { entries: readonly ShippedEntry[]; isLeaving: boolean }[] = [];
    let tick: () => void = () => {};
    let status = 204;

    const shipped = shipper({
        level: "info",
        send: (entries, isLeaving) =>
        {
            sent.push({ entries, isLeaving });

            return Promise.resolve(status);
        },
        every: (run) =>
        {
            tick = run;
        },
        ...options,
    });

    return {
        shipped,
        sent,
        tick: () => tick(),
        answer: (next: number) =>
        {
            status = next;
        },
    };
}

describe("the logger", () =>
{
    test("hands every writer what is at or above its level, and nothing below", () =>
    {
        const first: LogEntry[] = [];
        const second: LogEntry[] = [];
        const log = create({ level: "warn", write: [(written) => first.push(written), (written) => second.push(written)], now: fixedNow });

        log.info("items: loaded");
        log.warn("items: slow", { ms: 900 });

        expect(first).toEqual([{ level: "warn", at: "2026-01-01T00:00:00.000Z", plugin: "items", line: "slow", about: { ms: 900 } }]);
        expect(second).toEqual(first);
    });

    test("leaves a line without a plugin prefix whole", () =>
    {
        const written: LogEntry[] = [];
        const log = create({ level: "debug", write: (next) => written.push(next), now: fixedNow });

        log.debug("transport ready");

        expect(written[0]).toMatchObject({ plugin: undefined, line: "transport ready" });
    });

    test("refuses a level it does not know, naming the four", () =>
    {
        expect(() => create({ level: "loud" as "info", write: () => {} })).toThrow("debug, info, warn, error");
    });
});

describe("the shipper", () =>
{
    test("never sends below info, whatever level it was given", () =>
    {
        const run = shipping({ level: "debug" });

        run.shipped.write(entry("debug", "detail"));
        run.shipped.flush(false);

        expect(run.sent).toEqual([]);
    });

    test("sends on its timer, and at once when twenty lines wait", () =>
    {
        const run = shipping();

        run.shipped.write(entry("info", "first"));
        run.tick();

        for (let index = 0; index < 20; index += 1)
        {
            run.shipped.write(entry("warn", `line ${String(index)}`));
        }

        expect(run.sent.map((batch) => batch.entries.length)).toEqual([1, 20]);
    });

    test("counts a line already waiting instead of queuing it again", () =>
    {
        const run = shipping();

        run.shipped.write(entry("error", "failed"));
        run.shipped.write(entry("error", "failed"));
        run.shipped.write(entry("error", "failed"));
        run.tick();

        expect(run.sent[0]?.entries).toEqual([expect.objectContaining({ line: "failed", about: { repeated: 3 } })]);
    });

    test("redacts secret-named keys and token-shaped values before anything leaves", () =>
    {
        const run = shipping();

        run.shipped.write(entry("error", "refused Bearer abc.def", {
            authorization: "Bearer abc",
            apiKey: "k-1",
            note: "used sk_live_12345678 and eyJhbGciOi.eyJzdWIiOi.c2lnbmF0dXJl",
            count: 2,
        }));
        run.tick();

        expect(run.sent[0]?.entries[0]).toMatchObject({
            line: "refused [redacted]",
            about: { authorization: "[redacted]", apiKey: "[redacted]", note: "used [redacted] and [redacted]", count: 2 },
        });
    });

    test("clips long text and keeps at most twenty keys", () =>
    {
        const run = shipping();
        const about = Object.fromEntries(Array.from({ length: 30 }, (_, index) => [`k${String(index)}`, index]));

        run.shipped.write(entry("warn", "x".repeat(600), about));
        run.tick();

        const shipped = run.sent[0]?.entries[0];

        expect(shipped?.line).toHaveLength(500);
        expect(Object.keys(shipped?.about ?? {})).toHaveLength(20);
    });

    test("keeps a request under thirty kilobytes, sending what did not fit on the next tick", () =>
    {
        const run = shipping();
        const heavy = Object.fromEntries(Array.from({ length: 20 }, (_, index) => [`k${String(index)}`, "z".repeat(480)]));

        for (let index = 0; index < 5; index += 1)
        {
            run.shipped.write(entry("warn", `line ${String(index)}`, heavy));
        }

        run.tick();
        run.tick();
        const sizes = run.sent.map((batch) => JSON.stringify({ entries: batch.entries }).length);

        expect(sizes.every((size) => size <= 30_000)).toBe(true);
        expect(run.sent.flatMap((batch) => batch.entries.map((shipped) => shipped.line))).toEqual(["line 0", "line 1", "line 2", "line 3", "line 4"]);
    });

    test("pauses for a minute after a 429, dropping what waits", async () =>
    {
        let now = 0;
        const run = shipping({ now: () => now });
        run.answer(429);

        run.shipped.write(entry("error", "first"));
        run.tick();
        await Promise.resolve();
        run.answer(204);
        run.shipped.write(entry("error", "during the pause"));
        now = 60_001;
        run.shipped.write(entry("error", "after it"));
        run.tick();

        expect(run.sent.map((batch) => batch.entries.map((shipped) => shipped.line))).toEqual([["first"], ["after it"]]);
    });

    test("says the page is being left, so the send can outlive it", () =>
    {
        const run = shipping();

        run.shipped.write(entry("error", "last words"));
        run.shipped.flush(true);

        expect(run.sent[0]?.isLeaving).toBe(true);
    });

    test("drops a batch whose send failed, rather than retrying it", async () =>
    {
        const failing = shipper({ level: "info", send: () => Promise.reject(new Error("offline")), every: () => {} });

        failing.write(entry("error", "lost"));
        failing.flush(false);
        await Promise.resolve();

        expect(() => failing.flush(false)).not.toThrow();
    });
});

describe("posting to the application", () =>
{
    test("sends the entries as JSON, kept alive when the page is being left", async () =>
    {
        const fetched = vi.fn(() => Promise.resolve(new Response(null, { status: 204 })));
        vi.stubGlobal("fetch", fetched);

        const status = await postTo("/api/client-logs")([{ level: "error", at: "t", line: "x" }], true);

        expect(status).toBe(204);
        expect(fetched).toHaveBeenCalledWith("/api/client-logs", expect.objectContaining({
            method: "POST",
            keepalive: true,
            body: JSON.stringify({ entries: [{ level: "error", at: "t", line: "x" }] }),
        }));
    });
});

describe("capturing what nothing caught", () =>
{
    test("logs an uncaught error and an unhandled rejection, and stops when asked", () =>
    {
        const source = new EventTarget();
        const written: LogEntry[] = [];
        const log = create({ level: "error", write: (next) => written.push(next) });
        const listen = {
            addEventListener: (kind: string, listener: (event: unknown) => void) => source.addEventListener(kind, listener),
            removeEventListener: (kind: string, listener: (event: unknown) => void) => source.removeEventListener(kind, listener),
        };

        const stop = captureErrors(log, listen);
        source.dispatchEvent(Object.assign(new Event("error"), { error: new Error("boom") }));
        source.dispatchEvent(Object.assign(new Event("unhandledrejection"), { reason: "nope" }));
        stop();
        source.dispatchEvent(Object.assign(new Event("error"), { error: new Error("after") }));

        expect(written.map((next) => next.line)).toEqual(["uncaught error: boom", "unhandled rejection: nope"]);
    });
});
