import { describe, expect, test } from "vitest";
import { z } from "zod";

import { definePlugin } from "../../kernel/api";
import { start } from "../api";

function listing(heard: unknown[])
{
    return definePlugin("items", {
        version: "1.0.0",
        describe: "Lists items a page at a time.",
        config: z.object({ pageSize: z.coerce.number() }),
        setup: (ctx) =>
        {
            heard.push(ctx.config.pageSize);
        },
    });
}

describe("config from the environment", () =>
{
    test("reaches the plugin, coerced by its own schema", async () =>
    {
        const heard: unknown[] = [];

        const app = await start({ plugins: [listing(heard)], environment: { VITE_ITEMS__PAGE_SIZE: "20" }, transport: { baseUrl: "/api" } });

        expect(heard).toEqual([20]);
        await app.stop();
    });

    test("gives way to config the application passes for that plugin", async () =>
    {
        const heard: unknown[] = [];

        const app = await start({
            plugins: [listing(heard)],
            environment: { VITE_ITEMS__PAGE_SIZE: "20" },
            config: { items: { pageSize: 50 } },
            transport: { baseUrl: "/api" },
        });

        expect(heard).toEqual([50]);
        await app.stop();
    });

    test("stops the start, naming the variable, before any plugin runs", async () =>
    {
        const heard: unknown[] = [];

        const failed = start({ plugins: [listing(heard)], environment: { VITE_ITEMS__PAGE_SIZ: "20" }, transport: { baseUrl: "/api" } });

        await expect(failed).rejects.toThrow("VITE_ITEMS__PAGE_SIZ names no field");
        expect(heard).toEqual([]);
    });
});
