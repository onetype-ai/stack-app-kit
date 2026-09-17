import { describe, expect, test } from "vitest";

import { serving } from "../vite";

describe("where an application listens", () =>
{
    test("is a port of its own, so it never collides with the api or another front", () =>
    {
        expect(serving().port).toBe(7380);
    });

    test("and moves where PORT says, so several people run their own", () =>
    {
        expect(serving({ set: { PORT: "7381" } }).port).toBe(7381);
    });

    test("refuses to start on a port already taken, rather than quietly moving", () =>
    {
        expect(serving().strictPort).toBe(true);
    });

    test("and refuses a port that is not one", () =>
    {
        for (const bad of ["abc", "99999", "0", "1.5", "-1"])
        {
            expect(() => serving({ set: { PORT: bad } })).toThrow(/whole port/);
        }
    });

    test("while an empty one falls back rather than reading as zero", () =>
    {
        expect(serving({ set: { PORT: "" } }).port).toBe(7380);
    });
});

describe("which server /api reaches", () =>
{
    test("is the api's own port, so a front out of the box finds one", () =>
    {
        expect(serving().proxy["/api"]?.target).toBe("http://localhost:7280");
    });

    test("and moves where API_PORT says, so a front reaches a back of its own", () =>
    {
        expect(serving({ set: { API_PORT: "7281" } }).proxy["/api"]?.target).toBe("http://localhost:7281");
    });

    test("strips the prefix, so a plugin asking for /api/documents reaches /documents", () =>
    {
        expect(serving().proxy["/api"]?.rewrite("/api/documents")).toBe("/documents");
    });

    test("and strips only the leading one, so /api/a/api/b keeps the second", () =>
    {
        expect(serving().proxy["/api"]?.rewrite("/api/a/api/b")).toBe("/a/api/b");
    });

    test("and refuses an api port that is not one", () =>
    {
        expect(() => serving({ set: { API_PORT: "nowhere" } })).toThrow(/whole port/);
    });
});
