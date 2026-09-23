import { QueryClient, QueryObserver } from "@tanstack/query-core";
import { describe, expect, test, vi } from "vitest";

import { createKernel, definePlugin } from "../../kernel/api";
import { fromQueries } from "../api";

const probe = definePlugin("probe", { version: "1.0.0", describe: "Reaches for what a context carries." });

function loadingSlowly(client: QueryClient): { signal: Promise<AbortSignal>; settled: Promise<unknown> }
{
    let handOver: (signal: AbortSignal) => void = () => {};
    const signal = new Promise<AbortSignal>((resolve) =>
    {
        handOver = resolve;
    });
    const settled = client.fetchQuery({
        queryKey: ["items", "slow"],
        queryFn: ({ signal: aborting }) =>
        {
            handOver(aborting);

            return new Promise((resolve) =>
            {
                setTimeout(() =>
                {
                    resolve(["from the previous owner"]);
                }, 50);
            });
        },
    }).catch((cause: unknown) => cause);

    return { signal, settled };
}

describe("clearing the cache built from a query client", () =>
{
    test("drops every entry no view shows, whatever its key", () =>
    {
        const client = new QueryClient();
        client.setQueryData(["items", "1"], { id: "1" });
        client.setQueryData(["tags"], ["a"]);

        fromQueries(client).clear();

        expect(client.getQueryCache().getAll()).toEqual([]);
    });

    test("tells a view still showing an entry, which then shows what the new owner holds", async () =>
    {
        const client = new QueryClient();
        let owner = "first";
        const view = new QueryObserver(client, { queryKey: ["items"], queryFn: () => Promise.resolve(`${owner}'s items`) });
        const stop = view.subscribe(() => {});
        await vi.waitFor(() =>
        {
            expect(view.getCurrentResult().data).toBe("first's items");
        });

        owner = "second";
        fromQueries(client).clear();
        const rightAfter = view.getCurrentResult().data;
        await vi.waitFor(() =>
        {
            expect(view.getCurrentResult().data).toBe("second's items");
        });
        stop();

        expect(rightAfter).toBeUndefined();
    });

    test("cancels what is still loading, so nothing lands after the clear", async () =>
    {
        const client = new QueryClient();
        const { signal, settled } = loadingSlowly(client);

        fromQueries(client).clear();
        await settled;

        expect((await signal).aborted).toBe(true);
        expect(client.getQueryData(["items", "slow"])).toBeUndefined();
    });

    test("refuses a client that cannot cancel, remove and reset, naming what to pass", () =>
    {
        const cache = fromQueries({ invalidateQueries: () => {} });

        expect(() => cache.clear()).toThrow(expect.objectContaining({ code: "INVALID_CONFIG", message: expect.stringContaining("Pass the client itself") }));
    });
});

describe("ctx.cache.clear", () =>
{
    test("reaches the cache the application gave", async () =>
    {
        const client = new QueryClient();
        client.setQueryData(["items"], ["a"]);
        const kernel = createKernel({ plugins: [probe], cache: fromQueries(client) });
        await kernel.start();

        kernel.context("probe").cache.clear();

        expect(client.getQueryCache().getAll()).toEqual([]);
    });

    test("refuses, naming what to give, when the given cache cannot clear", async () =>
    {
        const kernel = createKernel({ plugins: [probe], cache: { invalidate: () => {} } });
        await kernel.start();

        expect(() => kernel.context("probe").cache.clear()).toThrow("has no clear");
    });

    test("refuses, naming itself, when no cache was given", async () =>
    {
        const kernel = createKernel({ plugins: [probe] });
        await kernel.start();

        expect(() => kernel.context("probe").cache.clear()).toThrow("no cache was given");
    });
});
