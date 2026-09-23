import { describe, expect, test } from "vitest";

import { definePlugin } from "../../kernel/api";
import type { RouterOptions } from "../../router/api";
import { start } from "../api";

function recordingRouter(steps: string[]): RouterOptions
{
    return {
        createRootRoute: () => ({ addChildren: function addChildren() { return this; } }),
        createRoute: () => ({}),
        createRouter: () =>
        {
            const router: { ssr?: unknown; load: () => Promise<void> } = {
                load: async () =>
                {
                    steps.push(`loaded with ssr ${JSON.stringify(router.ssr)}`);
                },
            };

            return router;
        },
    };
}

async function started(prerendered: boolean | undefined, steps: string[])
{
    const page = definePlugin("items", { version: "1.0.0", describe: "Lists items.", routes: [{ path: "/items", title: "Items", component: () => null }] });

    return start({
        plugins: [page],
        transport: { baseUrl: "/api" },
        ...(prerendered !== undefined && { prerendered }),
        router: {
            building: recordingRouter(steps),
            missing: () => null,
            outlet: () => null,
            wrap: (_frame, outlet) => outlet,
            landing: () => () => null,
            guard: () => () => null,
        },
    });
}

describe("a page a prerender wrote", () =>
{
    test("has its router loaded as the server rendered it before start answers, so hydration matches", async () =>
    {
        const steps: string[] = [];

        const app = await started(true, steps);

        expect(steps).toEqual(["loaded with ssr {}"]);
        await app.stop();
    });

    test("leaves the router alone on a page the browser renders first", async () =>
    {
        const steps: string[] = [];

        const app = await started(undefined, steps);

        expect(steps).toEqual([]);
        await app.stop();
    });
});
