import { describe, expect, test } from "vitest";

import { Env } from "../env";

describe("a value that is set and empty", () =>
{
    test("is refused, rather than read as the fallback an unset one takes", () =>
    {
        expect(() => Env.rules.text("VITE_API_URL", "", "/api")).toThrow(/VITE_API_URL/);
    });

    test("while an unset one takes the fallback, so absent and blank never agree", () =>
    {
        expect(Env.rules.text("VITE_API_URL", undefined, "/api")).toBe("/api");
    });

    test("and one that is not a string at all is refused, whatever a bundler handed over", () =>
    {
        expect(() => Env.rules.text("VITE_API_URL", 7)).toThrow(/VITE_API_URL/);
        expect(() => Env.rules.text("VITE_API_URL", true)).toThrow(/VITE_API_URL/);
    });

    test("and a required one that is unset names itself", () =>
    {
        expect(() => Env.rules.required("VITE_API_URL", undefined)).toThrow(/VITE_API_URL/);
    });
});

describe("a number read from configuration", () =>
{
    test("is refused when it is only a space, rather than read as zero", () =>
    {
        expect(() => Env.rules.number("VITE_PORT", "  ", 1)).toThrow(/VITE_PORT/);
    });

    test("and refused when it is not a whole number at all", () =>
    {
        for (const bad of ["abc", "-1", "1.5", "1e999"])
        {
            expect(() => Env.rules.number("VITE_PORT", bad, 1)).toThrow(/VITE_PORT/);
        }
    });

    test("and refused when it is outside what it may be, at either end", () =>
    {
        expect(() => Env.rules.number("VITE_PORT", "0", 1, 1, 65_535)).toThrow(/VITE_PORT/);
        expect(() => Env.rules.number("VITE_PORT", "70000", 1, 1, 65_535)).toThrow(/VITE_PORT/);
    });

    test("but taken at either end of what it may be", () =>
    {
        expect(Env.rules.number("VITE_PORT", "1", 3000, 1, 65_535)).toBe(1);
        expect(Env.rules.number("VITE_PORT", "65535", 3000, 1, 65_535)).toBe(65_535);
    });
});

describe("a flag read from configuration", () =>
{
    test("takes the two words it knows", () =>
    {
        expect(Env.rules.flag("VITE_ON", "true", false)).toBe(true);
        expect(Env.rules.flag("VITE_ON", "false", true)).toBe(false);
    });

    test("and refuses anything else rather than guessing what it meant", () =>
    {
        for (const bad of ["1", "yes", "TRUE", "on"])
        {
            expect(() => Env.rules.flag("VITE_ON", bad, false)).toThrow(/VITE_ON/);
        }
    });
});

describe("a list read from configuration", () =>
{
    test("means nothing allowed when it is set and empty", () =>
    {
        expect(Env.rules.list("")).toEqual([]);
    });

    test("and drops the gaps a trailing comma leaves", () =>
    {
        expect(Env.rules.list("a, b, ,")).toEqual(["a", "b"]);
    });
});

describe("one of a list of allowed words", () =>
{
    test("is taken when it is on the list", () =>
    {
        expect(Env.rules.oneOf("VITE_LEVEL", "warn", ["debug", "info", "warn"], "info")).toBe("warn");
    });

    test("and refused when it is not, naming what was allowed", () =>
    {
        expect(() => Env.rules.oneOf("VITE_LEVEL", "shouting", ["debug", "info", "warn"], "info"))
            .toThrow(/VITE_LEVEL/);
    });
});

describe("a refusal", () =>
{
    test("is a BootFault a caller can match, naming the variable", () =>
    {
        const refused = (() =>
        {
            try
            {
                Env.rules.number("VITE_PORT", "eighty", 80);
            }
            catch (error)
            {
                return error;
            }

            return undefined;
        })();

        expect(refused).toMatchObject({ name: "BootFault", code: "INVALID_ENV", message: expect.stringContaining("VITE_PORT") });
    });
});
