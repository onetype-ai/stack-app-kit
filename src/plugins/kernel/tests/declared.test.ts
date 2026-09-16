import { describe, expect, test } from "vitest";
import { z } from "zod";

import { declarationsOf, definePlugin } from "../api";

const dashboard = definePlugin("dashboard", {
    version: "2.0.0",
    describe: "Shows the numbers",
    dependsOn: ["auth"],
    config: z.object({ rows: z.number() }),
    permissions: { "dashboard.read": { describe: "See the dashboard" } },
    slots: { "dashboard.widget": { describe: "A card on the dashboard", schema: z.object({}) } },
    contributes: [{ slot: "nav.item", order: 10, requires: ["dashboard.read"], render: () => null }],
    emits: { "dashboard.opened": { describe: "Someone looked", schema: z.object({}) } },
    listens: { "auth.signedIn": { describe: "Refreshes", handle: () => {} } },
    commands: { "dashboard.refresh": { describe: "Reloads", requires: ["dashboard.read"], schema: z.object({}), run: () => {} } },
    routes: [
        { path: "/dashboard", title: "Dashboard", component: () => null, requires: ["dashboard.read"] },
        { path: "/", title: "Home", component: () => null, instead: () => "/dashboard" },
    ],
    setup: () => {},
});

const bare = definePlugin("bare", { version: "0.1.0", describe: "Declares nothing else" });

describe("declarationsOf", () =>
{
    test("reads every surface one plugin declares", () =>
    {
        const [declared] = declarationsOf([dashboard]);

        expect(declared?.name).toBe("dashboard");
        expect(declared?.version).toBe("2.0.0");
        expect(declared?.dependsOn).toEqual(["auth"]);
        expect(declared?.permissions.map((each) => each.name)).toEqual(["dashboard.read"]);
        expect(declared?.slots.map((each) => each.name)).toEqual(["dashboard.widget"]);
        expect(declared?.emits.map((each) => each.name)).toEqual(["dashboard.opened"]);
        expect(declared?.config).toBe(true);
        expect(declared?.teardown).toBe(false);
    });

    test("carries what a page takes to see", () =>
    {
        const [declared] = declarationsOf([dashboard]);
        const guarded = declared?.routes.find((route) => route.path === "/dashboard");
        const redirecting = declared?.routes.find((route) => route.path === "/");

        expect(guarded?.title).toBe("Dashboard");
        expect(guarded?.requires).toEqual(["dashboard.read"]);
        expect(guarded?.instead).toBe(false);

        // a route sending the viewer elsewhere is asked before requires
        expect(redirecting?.instead).toBe(true);
    });

    test("names the slot a contribution fills, and its order", () =>
    {
        const [declared] = declarationsOf([dashboard]);

        expect(declared?.contributes[0]?.slot).toBe("nav.item");
        expect(declared?.contributes[0]?.order).toBe(10);
        expect(declared?.contributes[0]?.requires).toEqual(["dashboard.read"]);
    });

    test("answers empty lists for a plugin declaring nothing", () =>
    {
        const [declared] = declarationsOf([bare]);

        expect(declared?.routes).toEqual([]);
        expect(declared?.slots).toEqual([]);
        expect(declared?.contributes).toEqual([]);
        expect(declared?.frame).toBe(false);
        expect(declared?.setup).toBe(false);
    });

    test("narrows to one name, and sorts what it answers", () =>
    {
        expect(declarationsOf([dashboard, bare]).map((each) => each.name)).toEqual(["bare", "dashboard"]);
        expect(declarationsOf([dashboard, bare], "dashboard").map((each) => each.name)).toEqual(["dashboard"]);
    });

    test("answers nothing for a name no plugin carries", () =>
    {
        expect(declarationsOf([dashboard], "absent")).toEqual([]);
    });
});
