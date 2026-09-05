import { describe, expect, test } from "vitest";
import { z } from "zod";

import { createKernel, definePlugin, KernelFault } from "../api";
import type { Definition, Plugin } from "../api";

/** A plugin with only what a case needs, and nothing that distracts from it. */
function made(name: string, held: Partial<Definition> = {}): Plugin
{
    return definePlugin(name, {
        version: "1.0.0",
        describe: `The ${name} plugin.`,
        ...held,
    });
}

/** Starts a kernel and answers what it refused, or undefined. */
async function refused(plugins: readonly Plugin[], config: Record<string, unknown> = {}): Promise<KernelFault | undefined>
{
    const kernel = createKernel({ plugins, config });

    try
    {
        await kernel.start();

        return undefined;
    }
    catch (cause)
    {
        return cause as KernelFault;
    }
}

describe("names", () =>
{
    test("refuses a plugin name that is not lowercase and hyphens", () =>
    {
        expect(() => made("Auth")).toThrow(KernelFault);
        expect(() => made("auth_plugin")).toThrow(/lowercase letters, digits and hyphens/);
    });

    test("names the character that broke the name", () =>
    {
        expect(() => made("auth plugin")).toThrow(/position 5/);
    });

    test("refuses an event outside the plugin's namespace, and says what to rename it to", async () =>
    {
        const failed = await refused([
            made("auth", { emits: { "session.ended": { describe: "gone", schema: z.object({}) } } }),
        ]);

        expect(failed?.code).toBe("INVALID_NAME");
        expect(failed?.message).toMatch(/belongs to "session", not to "auth"/);
        expect(failed?.message).toMatch(/auth\.ended/);
    });
});

describe("dependencies", () =>
{
    test("refuses a dependency no plugin provides", async () =>
    {
        const failed = await refused([made("billing", { dependsOn: ["missing"] })]);

        expect(failed?.code).toBe("UNKNOWN_DEPENDENCY");
        expect(failed?.message).toMatch(/"missing", which no plugin provides/);
    });

    test("refuses a cycle, naming the loop", async () =>
    {
        const failed = await refused([
            made("a", { dependsOn: ["b"] }),
            made("b", { dependsOn: ["a"] }),
        ]);

        expect(failed?.code).toBe("DEPENDENCY_CYCLE");
        expect(failed?.message).toMatch(/a -> b -> a|b -> a -> b/);
    });

    test("refuses two plugins with one name", async () =>
    {
        const failed = await refused([made("auth"), made("auth")]);

        expect(failed?.code).toBe("DUPLICATE_PLUGIN");
    });

    test("starts a plugin after the ones it depends on", async () =>
    {
        const started: string[] = [];
        const kernel = createKernel({
            plugins: [
                made("billing", { dependsOn: ["auth"], setup: () => void started.push("billing") }),
                made("auth", { setup: () => void started.push("auth") }),
            ],
        });

        await kernel.start();

        expect(started).toEqual(["auth", "billing"]);
    });
});

describe("declarations", () =>
{
    test("refuses two plugins declaring one route", async () =>
    {
        const page = (): null => null;
        const failed = await refused([
            made("auth", { routes: [{ path: "/x", component: page }] }),
            made("billing", { routes: [{ path: "/x", component: page }] }),
        ]);

        expect(failed?.code).toBe("DUPLICATE_ROUTE");
        expect(failed?.message).toMatch(/already declared by "auth"/);
    });

    test("refuses a route path in the wrong syntax", async () =>
    {
        const failed = await refused([made("auth", { routes: [{ path: "auth/login", component: () => null }] })]);

        expect(failed?.code).toBe("INVALID_ROUTE");
        expect(failed?.message).toMatch(/must start with "\/"/);
    });

    test("refuses a version that is not a version", async () =>
    {
        const failed = await refused([
            definePlugin("auth", { version: "banana", describe: "The auth plugin." }),
        ]);

        expect(failed?.code).toBe("INVALID_NAME");
        expect(failed?.message).toMatch(/is not a version/);
    });

    test("refuses an empty description", async () =>
    {
        const failed = await refused([definePlugin("auth", { version: "1.0.0", describe: "  " })]);

        expect(failed?.message).toMatch(/describes itself in one sentence/);
    });
});

describe("references", () =>
{
    test("refuses listening to an event nothing declares", async () =>
    {
        const failed = await refused([made("billing", { listens: { "auth.signed-out": { describe: "hears it", handle: () => {} } } })]);

        expect(failed?.code).toBe("UNDECLARED_EVENT");
    });

    test("refuses reaching something owned by an undeclared dependency", async () =>
    {
        const failed = await refused([
            made("auth", { emits: { "auth.signed-out": { describe: "gone", schema: z.object({}) } } }),
            made("billing", { listens: { "auth.signed-out": { describe: "hears it", handle: () => {} } } }),
        ]);

        expect(failed?.code).toBe("UNDECLARED_DEPENDENCY");
        expect(failed?.message).toMatch(/Add "auth" to dependsOn/);
    });

    test("allows it once the dependency is declared", async () =>
    {
        const failed = await refused([
            made("auth", { emits: { "auth.signed-out": { describe: "gone", schema: z.object({}) } } }),
            made("billing", { dependsOn: ["auth"], listens: { "auth.signed-out": { describe: "hears it", handle: () => {} } } }),
        ]);

        expect(failed).toBeUndefined();
    });

    test("refuses a contribution to a slot nothing declares", async () =>
    {
        const failed = await refused([
            made("billing", { contributes: [{ slot: "shell.sidebar", render: () => null }] }),
        ]);

        expect(failed?.code).toBe("UNDECLARED_SLOT");
    });

    test("refuses a route needing a permission nothing declares", async () =>
    {
        const failed = await refused([
            made("billing", { routes: [{ path: "/b", component: () => null, requires: ["billing.read"] }] }),
        ]);

        expect(failed?.code).toBe("UNDECLARED_PERMISSION");
    });
});

describe("config", () =>
{
    test("refuses config that fails its schema, naming the key", async () =>
    {
        const failed = await refused(
            [made("billing", { config: z.object({ pageSize: z.number() }) })],
            { billing: { pageSize: "many" } },
        );

        expect(failed?.code).toBe("INVALID_CONFIG");
        expect(failed?.message).toMatch(/at "pageSize"/);
    });

    test("hands a plugin its own parsed config", async () =>
    {
        let seen: unknown;
        const kernel = createKernel({
            plugins: [
                made("billing", {
                    config: z.object({ pageSize: z.number() }),
                    setup: (ctx) => void (seen = ctx.config),
                }),
            ],
            config: { billing: { pageSize: 50 } },
        });

        await kernel.start();

        expect(seen).toEqual({ pageSize: 50 });
    });
});

describe("reporting everything at once", () =>
{
    test("names every problem in one run, not just the first", async () =>
    {
        const failed = await refused([
            made("a", { dependsOn: ["nope"] }),
            made("b", { listens: { "c.thing": { describe: "hears it", handle: () => {} } } }),
        ]);

        expect(failed?.message).toMatch(/2 problems/);
        expect(failed?.message).toMatch(/nope/);
        expect(failed?.message).toMatch(/c\.thing/);
    });

    test("nothing starts when a contract is wrong", async () =>
    {
        const started: string[] = [];
        const kernel = createKernel({
            plugins: [
                made("fine", { setup: () => void started.push("fine") }),
                made("broken", { dependsOn: ["nope"] }),
            ],
        });

        await kernel.start().catch(() => undefined);

        expect(started).toEqual([]);
        expect(kernel.started()).toBe(false);
    });
});

describe("events at runtime", () =>
{
    test("delivers a declared event to a listener", async () =>
    {
        const heard: unknown[] = [];
        const kernel = createKernel({
            plugins: [
                made("auth", {
                    emits: { "auth.signed-out": { describe: "gone", schema: z.object({ id: z.string() }) } },
                }),
                made("billing", {
                    dependsOn: ["auth"],
                    listens: { "auth.signed-out": { describe: "hears it", handle: (payload) => void heard.push(payload) } },
                }),
            ],
        });

        await kernel.start();
        kernel.context("auth").events.emit("auth.signed-out", { id: "u1" });

        expect(heard).toEqual([{ id: "u1" }]);
    });

    test("refuses emitting an event owned by another plugin", async () =>
    {
        const kernel = createKernel({
            plugins: [
                made("auth", { emits: { "auth.signed-out": { describe: "gone", schema: z.object({}) } } }),
                made("billing", { dependsOn: ["auth"] }),
            ],
        });

        await kernel.start();

        expect(() => kernel.context("billing").events.emit("auth.signed-out", {})).toThrow(/belongs to "auth"/);
    });

    test("refuses a payload that fails its schema", async () =>
    {
        const kernel = createKernel({
            plugins: [made("auth", { emits: { "auth.signed-out": { describe: "gone", schema: z.object({ id: z.string() }) } } })],
        });

        await kernel.start();

        expect(() => kernel.context("auth").events.emit("auth.signed-out", { id: 1 })).toThrow(KernelFault);
    });

    test("a listener that throws reaches neither the emitter nor the others", async () =>
    {
        const heard: string[] = [];
        const kernel = createKernel({
            plugins: [
                made("auth", { emits: { "auth.signed-out": { describe: "gone", schema: z.object({}) } } }),
                made("bad", { dependsOn: ["auth"], listens: { "auth.signed-out": { describe: "throws", handle: () => { throw new Error("boom"); } } } }),
                made("good", { dependsOn: ["auth"], listens: { "auth.signed-out": { describe: "hears it", handle: () => void heard.push("good") } } }),
            ],
        });

        await kernel.start();

        expect(() => kernel.context("auth").events.emit("auth.signed-out", {})).not.toThrow();

        expect(heard).toEqual(["good"]);
        expect(kernel.events.failures()).toHaveLength(1);
        expect(kernel.events.failures()[0]?.plugin).toBe("bad");
    });
});

describe("hooks", () =>
{
    test("a participant may refuse, and the reason travels back", async () =>
    {
        const kernel = createKernel({
            plugins: [
                made("notes", { hooks: { "notes.before-save": { describe: "about to save", schema: z.object({ size: z.number() }) } } }),
                made("quota", {
                    dependsOn: ["notes"],
                    participates: { "notes.before-save": { describe: "checks size", handle: (payload) => ((payload as { size: number }).size > 10 ? "too big" : undefined) } },
                }),
            ],
        });

        await kernel.start();

        await expect(kernel.context("notes").hooks.run("notes.before-save", { size: 99 })).resolves.toBe("too big");
        await expect(kernel.context("notes").hooks.run("notes.before-save", { size: 1 })).resolves.toBeUndefined();
    });

    test("a participant that throws is a refusal, never consent", async () =>
    {
        const kernel = createKernel({
            plugins: [
                made("notes", { hooks: { "notes.before-save": { describe: "about to save", schema: z.object({}) } } }),
                made("bad", { dependsOn: ["notes"], participates: { "notes.before-save": { describe: "crashes", handle: () => { throw new Error("crashed"); } } } }),
            ],
        });

        await kernel.start();

        await expect(kernel.context("notes").hooks.run("notes.before-save", {})).resolves.toMatch(/refused/);
    });
});

describe("commands", () =>
{
    test("refuses a command without its permission", async () =>
    {
        const kernel = createKernel({
            plugins: [
                made("billing", {
                    permissions: { "billing.write": { describe: "may refund" } },
                    commands: {
                        "billing.refund": {
                            describe: "refunds",
                            schema: z.object({}),
                            requires: ["billing.write"],
                            run: () => {},
                        },
                    },
                }),
            ],
            permissions: { granted: () => [] },
        });

        await kernel.start();

        const failed = await kernel.run("billing.refund", {}).catch((cause: unknown) => cause as KernelFault);

        expect(failed?.code).toBe("PERMISSION_DENIED");
    });

    test("runs it when the permission is granted", async () =>
    {
        let ran = false;
        const kernel = createKernel({
            plugins: [
                made("billing", {
                    permissions: { "billing.write": { describe: "may refund" } },
                    commands: {
                        "billing.refund": {
                            describe: "refunds",
                            schema: z.object({ id: z.string() }),
                            requires: ["billing.write"],
                            run: () => void (ran = true),
                        },
                    },
                }),
            ],
            permissions: { granted: () => ["billing.write"] },
        });

        await kernel.start();
        await kernel.run("billing.refund", { id: "1" });

        expect(ran).toBe(true);
    });

    test("refuses input that fails the command's schema", async () =>
    {
        const kernel = createKernel({
            plugins: [
                made("billing", {
                    commands: { "billing.refund": { describe: "refunds", schema: z.object({ id: z.string() }), run: () => {} } },
                }),
            ],
        });

        await kernel.start();

        const failed = await kernel.run("billing.refund", { id: 1 }).catch((cause: unknown) => cause as KernelFault);

        expect(failed?.code).toBe("INVALID_PAYLOAD");
    });

    test("refuses a command before the kernel started", async () =>
    {
        const kernel = createKernel({ plugins: [made("billing")] });

        const failed = await kernel.run("billing.refund", {}).catch((cause: unknown) => cause as KernelFault);

        expect(failed?.code).toBe("NOT_STARTED");
    });
});

describe("services", () =>
{
    test("a plugin reaches a declared dependency's services outside a component", async () =>
    {
        let seen: unknown;
        const kernel = createKernel({
            plugins: [
                made("auth", { services: () => ({ who: () => "u1" }) }),
                made("billing", {
                    dependsOn: ["auth"],
                    setup: (ctx) => void (seen = ctx.use<{ who: () => string }>("auth").who()),
                }),
            ],
        });

        await kernel.start();

        expect(seen).toBe("u1");
    });

    test("refuses reaching a plugin it did not declare", async () =>
    {
        const kernel = createKernel({
            plugins: [made("auth", { services: () => ({}) }), made("billing")],
        });

        await kernel.start();

        expect(() => kernel.context("billing").use("auth")).toThrow(/does not depend on/);
    });
});

describe("teardown", () =>
{
    test("tears down in reverse, and one that throws does not strand the rest", async () =>
    {
        const seen: string[] = [];
        const kernel = createKernel({
            plugins: [
                made("auth", { teardown: () => void seen.push("auth") }),
                made("billing", { dependsOn: ["auth"], teardown: () => { throw new Error("stuck"); } }),
            ],
        });

        await kernel.start();
        await kernel.stop();

        expect(seen).toEqual(["auth"]);
        expect(kernel.started()).toBe(false);
    });
});

describe("what only one plugin may own", () =>
{
    test("refuses two plugins declaring grants", async () =>
    {
        const failed = await refused([
            made("auth", { grants: () => ["a"] }),
            made("other", { grants: () => ["b"] }),
        ]);

        expect(failed?.code).toBe("DUPLICATE_GRANTS");
        expect(failed?.message).toMatch(/both declare grants/);
    });

    test("refuses two frames", async () =>
    {
        const failed = await refused([
            made("shell", { frame: () => null }),
            made("other", { frame: () => null }),
        ]);

        expect(failed?.code).toBe("DUPLICATE_FRAME");
    });

    test("refuses two 404 pages", async () =>
    {
        const failed = await refused([
            made("shell", { pages: { missing: () => null } }),
            made("other", { pages: { missing: () => null } }),
        ]);

        expect(failed?.code).toBe("DUPLICATE_PAGE");
    });

    test("one plugin may own the 403 and another the 404", async () =>
    {
        const failed = await refused([
            made("shell", { pages: { missing: () => null } }),
            made("guard", { pages: { forbidden: () => null } }),
        ]);

        expect(failed).toBeUndefined();
    });
});

describe("grants", () =>
{
    test("a plugin is the source of what the viewer may do", async () =>
    {
        const kernel = createKernel({
            plugins: [
                made("auth", { grants: () => ["demo.read"] }),
                made("demo", { permissions: { "demo.read": { describe: "sees demo" } } }),
            ],
        });

        await kernel.start();

        expect(kernel.permissions.has("demo.read")).toBe(true);
        expect(kernel.permissions.has("demo.write")).toBe(false);
    });

    test("it is read on every check, so a sign-out takes effect at once", async () =>
    {
        let signedIn = true;
        const kernel = createKernel({
            plugins: [
                made("auth", { grants: () => (signedIn ? ["demo.read"] : []) }),
                made("demo", { permissions: { "demo.read": { describe: "sees demo" } } }),
            ],
        });

        await kernel.start();

        expect(kernel.permissions.has("demo.read")).toBe(true);

        signedIn = false;

        expect(kernel.permissions.has("demo.read")).toBe(false);
    });

    test("a plugin's grants win over what the application passed", async () =>
    {
        const kernel = createKernel({
            plugins: [
                made("auth", { grants: () => ["from.plugin"] }),
                made("x", { permissions: { "x.read": { describe: "reads" } } }),
            ],
            permissions: { granted: () => ["from.application"] },
        });

        await kernel.start();

        expect(kernel.permissions.has("from.plugin")).toBe(true);
        expect(kernel.permissions.has("from.application")).toBe(false);
    });
});

describe("config defaults", () =>
{
    test("a schema whose keys all default starts with no config at all", async () =>
    {
        const failed = await refused([
            made("billing", { config: z.object({ pageSize: z.number().default(25) }) }),
        ]);

        expect(failed).toBeUndefined();
    });

    test("a plugin reads the defaults its schema filled in", async () =>
    {
        let seen: unknown;
        const kernel = createKernel({
            plugins: [
                made("billing", {
                    config: z.object({ pageSize: z.number().default(25), flag: z.boolean().default(false) }),
                    setup: (ctx) => void (seen = ctx.config),
                }),
            ],
            config: { billing: { pageSize: 50 } },
        });

        await kernel.start();

        expect(seen).toEqual({ pageSize: 50, flag: false });
    });

    test("a required key with nothing to default to is still refused", async () =>
    {
        const failed = await refused([
            made("billing", { config: z.object({ apiKey: z.string() }) }),
        ]);

        expect(failed?.code).toBe("INVALID_CONFIG");
    });
});
