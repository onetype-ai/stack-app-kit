import { describe, expect, test } from "vitest";

import { definePlugin, KernelFault } from "../../kernel/api";
import { start } from "../api";
import type { Plugin } from "../../kernel/api";

function granter(name: string): Plugin
{
    return definePlugin(name, {
        version: "1.0.0",
        describe: `The ${name} plugin, which answers what the viewer holds.`,
        grants: () => ["demo.read"],
    });
}

const demo = definePlugin("demo", {
    version: "1.0.0",
    describe: "Owns the permission the granter hands out.",
    permissions: { "demo.read": { describe: "Sees the demo." } },
});

describe("naming the plugin that may grant", () =>
{
    // start() is the entry both documents teach. The nomination existed on
    // createKernel and could not be reached from here, so an unnominated
    // plugin's grants applied to an application that had named another.
    test("refuses a plugin that grants without being the one named", async () =>
    {
        const starting = start({
            plugins: [granter("auth"), demo],
            transport: { baseUrl: "/api" },
            grantedBy: "nobody",
        });

        await expect(starting).rejects.toThrow(KernelFault);
        await expect(starting).rejects.toThrow(/UNNOMINATED_GRANTS/);
    });

    test("names the plugin it refused, and the one the application nominated", async () =>
    {
        let fault: KernelFault | undefined;

        try
        {
            await start({
                plugins: [granter("auth"), demo],
                transport: { baseUrl: "/api" },
                grantedBy: "identity",
            });
        }
        catch (cause)
        {
            fault = cause as KernelFault;
        }

        expect(fault?.code).toBe("UNNOMINATED_GRANTS");
        expect(fault?.message).toMatch(/"auth" declares grants/);
        expect(fault?.message).toMatch(/named "identity" as the one that may/);
    });

    test("admits the plugin the application nominated", async () =>
    {
        const app = await start({
            plugins: [granter("auth"), demo],
            transport: { baseUrl: "/api" },
            grantedBy: "auth",
        });

        expect(app.kernel.started()).toBe(true);
        expect(app.kernel.permissions.has("demo.read")).toBe(true);

        await app.stop();
    });

    // Omitting it keeps every application that never nominated one booting.
    test("admits any granter when the application nominated none", async () =>
    {
        const app = await start({
            plugins: [granter("auth"), demo],
            transport: { baseUrl: "/api" },
        });

        expect(app.kernel.started()).toBe(true);

        await app.stop();
    });
});
