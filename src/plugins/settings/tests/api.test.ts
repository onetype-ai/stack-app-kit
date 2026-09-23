import { describe, expect, test } from "vitest";
import { z } from "zod";

import { definePlugin } from "../../kernel/api";
import { SettingsFault, configFor, problemsOf, refusingSecrets } from "../api";

const items = definePlugin("items", {
    version: "1.0.0",
    describe: "Lists items a page at a time.",
    config: z.object({ pageSize: z.coerce.number(), apiUrl: z.string().optional() }),
});

const tags = definePlugin("tag-cloud", { version: "1.0.0", describe: "Declares no config." });

function refusalOf(run: () => unknown): SettingsFault
{
    try
    {
        run();
    }
    catch (error)
    {
        if (error instanceof SettingsFault)
        {
            return error;
        }

        throw error;
    }

    throw new Error("Nothing was refused.");
}

describe("config from the environment", () =>
{
    test("reaches the plugin's fields as strings, named in upper snake case", () =>
    {
        const config = configFor([items], { VITE_ITEMS__PAGE_SIZE: "20", VITE_ITEMS__API_URL: "https://example.test", MODE: "test" });

        expect(config).toEqual({ items: { pageSize: "20", apiUrl: "https://example.test" } });
    });

    test("names a hyphenated plugin with underscores", () =>
    {
        const refused = refusalOf(() => configFor([tags], { VITE_TAG_CLOUD__SIZE: "3" }));

        expect(refused.problems).toEqual([expect.stringContaining("\"tag-cloud\" declares no z.object config")]);
    });

    test("refuses a variable naming no field, listing the ones there are", () =>
    {
        const refused = refusalOf(() => configFor([items], { VITE_ITEMS__PAGE_SIZ: "20" }));

        expect(refused.problems).toEqual([expect.stringContaining("VITE_ITEMS__PAGE_SIZE, VITE_ITEMS__API_URL")]);
    });

    test("refuses a plugin variable that reads like a secret, even if the field exists", () =>
    {
        const keyed = definePlugin("maps", { version: "1.0.0", describe: "Draws maps.", config: z.object({ apiKey: z.string() }) });

        const refused = refusalOf(() => configFor([keyed], { VITE_MAPS__API_KEY: "sk_live_1" }));

        expect(refused.problems).toEqual([expect.stringContaining("reads like a secret")]);
    });

    test("reports every problem at once, not the first", () =>
    {
        const refused = refusalOf(() => configFor([items, tags], { VITE_ITEMS__NOPE_URL: "x", VITE_TAG_CLOUD__MODE: "y" }));

        expect(refused.problems).toHaveLength(2);
    });

    test("ignores variables that belong to no plugin, which the build guard checks", () =>
    {
        expect(configFor([items], { VITE_API_URL: "/api", BASE_URL: "/" })).toEqual({});
    });
});

describe("what may ship in the public bundle", () =>
{
    test("refuses a name that reads like a secret", () =>
    {
        expect(problemsOf(["VITE_PAYMENTS__SECRET_URL"])).toEqual([expect.stringContaining("reads like a secret")]);
    });

    test("trusts a name the application lists exactly, even one that reads like a key", () =>
    {
        expect(problemsOf(["VITE_PUBLISHABLE_KEY"], { application: ["VITE_PUBLISHABLE_KEY"] })).toEqual([]);
    });

    test("refuses an unlisted name that belongs to no plugin", () =>
    {
        expect(problemsOf(["VITE_API_URL"])).toEqual([expect.stringContaining("neither a plugin's")]);
    });

    test("refuses a plugin field without a public suffix", () =>
    {
        expect(problemsOf(["VITE_ITEMS__PRICE_TABLE"])).toEqual([expect.stringContaining("public suffix")]);
    });

    test("lets addresses, switches and sizes through, and ignores names outside VITE_", () =>
    {
        expect(problemsOf(["VITE_ITEMS__API_URL", "VITE_ITEMS__BETA_ENABLED", "VITE_ITEMS__PAGE_SIZE", "DATABASE_PASSWORD"])).toEqual([]);
    });

    test("stops a build with every problem in what the bundler exposes, and lets a clean one through", () =>
    {
        const refused = refusalOf(() => refusingSecrets().configResolved({ env: { VITE_A_TOKEN: "t", VITE_B__SECRET_URL: "u", MODE: "production" } }));

        expect(refused.problems).toHaveLength(2);
        expect(() => refusingSecrets().configResolved({ env: { VITE_ITEMS__API_URL: "u", MODE: "production" } })).not.toThrow();
    });

    test("reads the prefix the bundler was configured with, so a renamed prefix is still guarded", () =>
    {
        const refused = refusalOf(() => refusingSecrets().configResolved({ env: { PUBLIC_SESSION_SECRET: "s" }, envPrefix: ["PUBLIC_"] }));

        expect(refused.problems).toEqual([expect.stringContaining("PUBLIC_SESSION_SECRET reads like a secret")]);
    });

    test("trusts what the application lists as public", () =>
    {
        expect(() => refusingSecrets({ application: ["VITE_API_URL"] }).configResolved({ env: { VITE_API_URL: "/api" } })).not.toThrow();
    });
});
