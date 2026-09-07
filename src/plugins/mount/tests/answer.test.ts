import { afterEach, describe, expect, test } from "vitest";

import { definePlugin } from "../../kernel/api";
import { start } from "../internal/start";

const realFetch = globalThis.fetch;

afterEach(() =>
{
    globalThis.fetch = realFetch;
});

function answersWith(body: unknown, status = 200): void
{
    globalThis.fetch = (): Promise<Response> =>
    {
        return Promise.resolve(new Response(JSON.stringify(body), {
            status,
            headers: { "Content-Type": "application/json" },
        }));
    };
}

async function whatReaches(path: string): Promise<unknown>
{
    let answer: unknown;

    const probe = definePlugin("probe", {
        version: "1.0.0",
        describe: "Reads what the transport hands back.",
        setup: async (ctx) =>
        {
            answer = await ctx.http.get(path);
        },
    });

    const app = await start({ plugins: [probe], transport: { baseUrl: "/api" } });

    await app.stop();

    return answer;
}

describe("what ctx.http answers, asked of the real transport rather than read off its source", () =>
{
    test("is the body itself, never an envelope around it", async () =>
    {
        answersWith([{ id: "p_1", name: "One" }]);

        const answer = await whatReaches("/parts");

        expect(answer).toEqual([{ id: "p_1", name: "One" }]);
    });

    test("so an array arrives as an array, ready for a schema", async () =>
    {
        answersWith([1, 2, 3]);

        expect(Array.isArray(await whatReaches("/numbers"))).toBe(true);
    });

    test("and an object carries no status, body or channel of its own", async () =>
    {
        answersWith({ parts: [], total: 0 });

        const answer = await whatReaches("/parts") as Record<string, unknown>;

        expect(Object.keys(answer).sort()).toEqual(["parts", "total"]);
    });

    test("and a 204 answers undefined rather than an empty envelope", async () =>
    {
        globalThis.fetch = (): Promise<Response> =>
        {
            return Promise.resolve(new Response(null, { status: 204 }));
        };

        expect(await whatReaches("/gone")).toBeUndefined();
    });
});
