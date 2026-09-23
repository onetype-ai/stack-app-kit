import { describe, expect, test } from "vitest";

import { createKernel, definePlugin } from "../api";

const keeper = definePlugin("keeper", {
    version: "1.0.0",
    describe: "Answers what the viewer holds, and owns a permission of its own.",
    permissions: { "keeper.keys.manage": { describe: "Manage keys." } },
    grants: () => ["keeper.keys.manage"],
});

const pages = definePlugin("pages", {
    version: "1.0.0",
    describe: "Shows pages behind the keeper's permission.",
});

describe("the one plugin that grants", () =>
{
    test("owns permissions under its own name without the application naming it", async () =>
    {
        const kernel = createKernel({ plugins: [keeper, pages] });

        await kernel.start();

        expect(kernel.permissions.has("keeper.keys.manage")).toBe(true);
    });

    test("still loses to the plugin the application named in grantedBy", async () =>
    {
        const kernel = createKernel({ plugins: [keeper, pages], grantedBy: "pages" });

        const failed = await kernel.start().catch((error: unknown) => error);

        expect(failed).toMatchObject({ message: expect.stringContaining("UNNOMINATED_GRANTS") });
    });

    test("is refused a permission named inside another plugin", async () =>
    {
        const overreaching = definePlugin("keeper", {
            version: "1.0.0",
            describe: "Tries to own another plugin's permission.",
            permissions: { "pages.edit": { describe: "Edit pages." } },
            grants: () => [],
        });
        const kernel = createKernel({ plugins: [overreaching, pages] });

        await expect(kernel.start()).rejects.toThrow("INVALID_NAME");
    });
});

describe("two plugins that grant", () =>
{
    test("are refused, since which one answers would depend on boot order", async () =>
    {
        const second = definePlugin("second", {
            version: "1.0.0",
            describe: "Also answers what the viewer holds.",
            grants: () => [],
        });
        const kernel = createKernel({ plugins: [keeper, second, pages] });

        await expect(kernel.start()).rejects.toThrow("DUPLICATE_GRANTS");
    });
});
