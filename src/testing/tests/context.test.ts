import { afterEach, describe, expect, test } from "vitest";

import { definePlugin, start, transport } from "../../index";
import { fakeContext } from "../context";

const realFetch = globalThis.fetch;

afterEach(() =>
{
    globalThis.fetch = realFetch;
});

async function throughTransport(status: number, body: unknown): Promise<unknown>
{
    globalThis.fetch = (): Promise<Response> =>
    {
        return Promise.resolve(status === 204
            ? new Response(null, { status })
            : new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
    };

    let answer: unknown;

    const probe = definePlugin("probe", {
        version: "1.0.0",
        describe: "Reads what the transport hands back.",
        setup: async (ctx) =>
        {
            answer = await ctx.http.get("/thing").catch((cause: unknown) => cause);
        },
    });

    const app = await start({ plugins: [probe], transport: { baseUrl: "/api", retries: 0 } });

    await app.stop();

    return answer;
}

describe("the fake and the transport", () =>
{
    test("both hand back the body itself, with nothing wrapped around it", async () =>
    {
        const real = await throughTransport(200, { parts: [], total: 0 });
        const fake = await fakeContext({ "GET /thing": { parts: [], total: 0 } }).ctx.http.get("/thing");

        expect(fake).toEqual(real);
    });

    test("both answer a 204 as undefined", async () =>
    {
        const real = await throughTransport(204, undefined);
        const fake = await fakeContext({ "GET /thing": { status: 204 } }).ctx.http.get("/thing");

        expect(fake).toEqual(real);
        expect(fake).toBeUndefined();
    });

    test("both refuse a 404 with a fault carrying the same code and status", async () =>
    {
        const real = await throughTransport(404, { message: "gone" }) as transport.TransportFault;
        const fake = await fakeContext({ "GET /thing": { status: 404, body: { message: "gone" } } })
            .ctx.http.get("/thing")
            .catch((cause: unknown) => cause) as transport.TransportFault;

        expect(fake).toBeInstanceOf(transport.TransportFault);
        expect(fake.code).toBe(real.code);
        expect(fake.status).toBe(real.status);
    });

    test("and both keep the body a refusal carried, so a form finds its fields", async () =>
    {
        const sent = { fields: { name: "Already taken." } };

        const real = await throughTransport(409, sent) as transport.TransportFault;
        const fake = await fakeContext({ "GET /thing": { status: 409, body: sent } })
            .ctx.http.get("/thing")
            .catch((cause: unknown) => cause) as transport.TransportFault;

        expect(fake.body).toEqual(real.body);
        expect(fake.body).toEqual(sent);
    });
});

describe("a path the fake was never given", () =>
{
    test("is refused, so a service that stopped calling fails rather than passes", async () =>
    {
        const fake = fakeContext({});

        await expect(fake.ctx.http.get("/nothing")).rejects.toBeInstanceOf(transport.TransportFault);
    });

    test("and the refusal names the path, so the failure reads on its own", async () =>
    {
        const fake = fakeContext({});

        const thrown = await fake.ctx.http.get("/nothing").catch((cause: unknown) => cause) as transport.TransportFault;

        expect(thrown.path).toBe("/nothing");
        expect(thrown.method).toBe("GET");
    });

    test("while a route answering undefined on purpose is allowed to", async () =>
    {
        const fake = fakeContext({ "GET /nothing": undefined });

        await expect(fake.ctx.http.get("/nothing")).resolves.toBeUndefined();
    });
});

describe("what a fake records", () =>
{
    test("every request, with the query and body that went with it", async () =>
    {
        const fake = fakeContext({ "POST /parts": { id: "p_1" } });

        await fake.ctx.http.post("/parts", { query: { kind: "seal" }, body: { name: "One" } });

        expect(fake.asked).toEqual([{
            method: "POST",
            path: "/parts",
            query: { kind: "seal" },
            body: { name: "One" },
        }]);
    });

    test("every event announced, and every cache key dropped", () =>
    {
        const fake = fakeContext();

        fake.ctx.events.emit("demo.happened", { id: "1" });
        fake.ctx.cache.invalidate(["demo", "items"]);

        expect(fake.announced).toEqual([{ event: "demo.happened", payload: { id: "1" } }]);
        expect(fake.invalidated).toEqual([["demo", "items"]]);
    });

    test("and every command, without running anything", async () =>
    {
        const fake = fakeContext();

        await fake.ctx.commands.run("demo.do", { id: "1" });

        expect(fake.commanded).toEqual([{ command: "demo.do", input: { id: "1" } }]);
    });
});

describe("what a fake answers", () =>
{
    test("every permission, until a test says which", () =>
    {
        expect(fakeContext().ctx.permissions.has("anything")).toBe(true);

        const some = fakeContext({}, { permissions: ["demo.read"] });

        expect(some.ctx.permissions.has("demo.read")).toBe(true);
        expect(some.ctx.permissions.has("demo.write")).toBe(false);
        expect(some.ctx.permissions.all(["demo.read", "demo.write"])).toBe(false);
    });

    test("nothing from a hook, until a test sets a refusal", async () =>
    {
        const fake = fakeContext();

        await expect(fake.ctx.hooks.run("demo.before", {})).resolves.toBeUndefined();

        fake.refusal = "It is on a list.";

        await expect(fake.ctx.hooks.run("demo.before", {})).resolves.toBe("It is on a list.");
    });

    test("another plugin's services only where a test offered them, so an invented value fails", () =>
    {
        const fake = fakeContext({}, { offering: { catalog: { price: () => 140 } } });

        expect(fake.ctx.use<{ price: () => number }>("catalog").price()).toBe(140);
        expect(() => fake.ctx.use("billing")).toThrow(/billing/);
    });
});

describe("a request that carried a header", () =>
{
    test("records it, so a test can prove a closed route was signed", async () =>
    {
        const fake = fakeContext({ "GET /notes": { notes: [] } });

        await fake.ctx.http.get("/notes", { headers: { "x-key": "secret" } });

        expect(fake.asked[0]).toMatchObject({ headers: { "x-key": "secret" } });
    });

    test("and a request that carried none records none, so nothing reads as signed", async () =>
    {
        const fake = fakeContext({ "GET /pulse": { heard: 0 } });

        await fake.ctx.http.get("/pulse");

        expect(fake.asked[0]).not.toHaveProperty("headers");
    });
});
