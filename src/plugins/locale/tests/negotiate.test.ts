import { describe, expect, test } from "vitest";

import { negotiate } from "../api";

describe("negotiating a locale, by the case table both kits share", () =>
{
    test.each([
        ["de-AT,de;q=0.9,en;q=0.5", ["en", "de"], "en", undefined, "de"],
        ["fr", ["en", "de"], "en", undefined, "en"],
        ["en-GB;q=0.8,de;q=0.9", ["en", "de"], "en", undefined, "de"],
        [["pt-BR"], ["en", "pt-PT"], "en", undefined, "pt-PT"],
        ["de", ["en", "de"], "en", "en", "en"],
        ["*;q=1,de;q=0", ["en", "de"], "en", undefined, "en"],
    ] as const)("%j of %j → %s", (accepted, supported, fallback, chosen, answer) =>
    {
        expect(negotiate(accepted, supported, fallback, chosen)).toBe(answer);
    });
});

describe("negotiating a locale, beyond the table", () =>
{
    test("keeps header order between equal weights, and matches case-insensitively", () =>
    {
        expect(negotiate("DE-at, en", ["en", "de-DE", "de-AT"], "en")).toBe("de-AT");
    });

    test("ignores a stored choice nobody supports", () =>
    {
        expect(negotiate("de", ["en", "de"], "en", "fr")).toBe("de");
    });

    test("refuses a fallback that is not supported, naming the tags", () =>
    {
        expect(() => negotiate("de", ["en", "de"], "fr")).toThrow(expect.objectContaining({ code: "INVALID_CONFIG", message: expect.stringContaining("en, de") }));
    });
});
