import { describe, expect, test } from "vitest";

import { fromQueries } from "../api";

describe("cache", () =>
{
    test("passes the key through to the query client", () =>
    {
        const keys: unknown[][] = [];
        const cache = fromQueries({ invalidateQueries: ({ queryKey }) => keys.push(queryKey) });

        cache.invalidate(["demo", "items"]);

        expect(keys).toEqual([["demo", "items"]]);
    });

    test("copies the key, so a caller cannot change what was invalidated", () =>
    {
        const keys: unknown[][] = [];
        const cache = fromQueries({ invalidateQueries: ({ queryKey }) => keys.push(queryKey) });
        const key = ["demo", "items"];

        cache.invalidate(key);
        key.push("changed");

        expect(keys[0]).toEqual(["demo", "items"]);
    });
});
