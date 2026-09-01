import { describe, expect, test } from "vitest";

import { address } from "../internal/address";

describe("a relative base", () =>
{
    test("resolves against wherever the page is served from", () =>
    {
        expect(address("/api", "/session")).toBe("/api/session");
    });

    test("carries a query", () =>
    {
        expect(address("/api", "/items", { page: 2, q: "a b" })).toBe("/api/items?page=2&q=a+b");
    });

    test("does not double a slash", () =>
    {
        expect(address("/api/", "/items")).toBe("/api/items");
        expect(address("/api", "items")).toBe("/api/items");
    });
});

describe("an absolute base", () =>
{
    test("builds a full url", () =>
    {
        expect(address("https://example.test/api", "/items")).toBe("https://example.test/api/items");
    });

    test("carries a query", () =>
    {
        expect(address("https://example.test/api", "/items", { page: 2 })).toBe(
            "https://example.test/api/items?page=2",
        );
    });
});
