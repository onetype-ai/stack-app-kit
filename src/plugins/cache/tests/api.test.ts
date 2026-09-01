import { describe, expect, test } from "vitest";

import { fromQueries } from "../api";

describe("cache", () =>
{
    test("passes the key through to the query client", () =>
    {
        const seen: unknown[][] = [];
        const held = fromQueries({ invalidateQueries: ({ queryKey }) => seen.push(queryKey) });

        held.invalidate(["demo", "items"]);

        expect(seen).toEqual([["demo", "items"]]);
    });

    test("copies the key, so a caller cannot change what was invalidated", () =>
    {
        const seen: unknown[][] = [];
        const held = fromQueries({ invalidateQueries: ({ queryKey }) => seen.push(queryKey) });
        const key = ["demo", "items"];

        held.invalidate(key);
        key.push("changed");

        expect(seen[0]).toEqual(["demo", "items"]);
    });
});
