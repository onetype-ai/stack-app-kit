import { describe, expect, test } from "vitest";
import { z } from "zod";

import { createKernel, declarationsOf, definePlugin } from "../api";

import type { Definition, Pipeline, PipelineStep, Plugin } from "../api";

function createPlugin(name: string, definition: Partial<Definition> = {}): Plugin
{
    return definePlugin(name, {
        version: "1.0.0",
        describe: `The ${name} plugin.`,
        ...definition,
    });
}

const Draft = z.object({ text: z.string(), marks: z.array(z.string()) });

const mark = (label: string): PipelineStep["run"] => (state) =>
{
    const draft = state as z.infer<typeof Draft>;

    return { ...draft, marks: [...draft.marks, label] };
};

function createPosts(pipeline: Partial<Pipeline> = {}): Plugin
{
    return createPlugin("posts", {
        pipelines: {
            "posts.publish": {
                describe: "Turns a draft into a published post.",
                input: Draft,
                output: Draft,
                steps: [{ id: "validate", run: mark("validate") }, { id: "store", run: mark("store") }],
                ...pipeline,
            },
        },
    });
}

const createAdder = (name: string, steps: PipelineStep[]) => createPlugin(name, { dependsOn: ["posts"], adds: { "posts.publish": steps } });

describe("a pipeline", () =>
{
    test("runs the owner's steps and the added ones beside their anchors, the same whatever order plugins load in", async () =>
    {
        const plugins = [
            createAdder("moderation", [{ id: "moderate", after: "validate", run: mark("moderate") }]),
            createAdder("links", [{ id: "shorten", after: "validate", run: mark("shorten") }, { id: "preview", before: "store", run: mark("preview") }]),
            createPosts(),
        ];
        const kernel = createKernel({ plugins });
        const reversed = createKernel({ plugins: [...plugins].reverse() });
        await kernel.start();
        await reversed.start();

        const published = await kernel.context("moderation").pipeline("posts.publish").run({ text: "hi", marks: [] });

        expect(published).toEqual({ text: "hi", marks: ["validate", "shorten", "moderate", "preview", "store"] });
        expect(kernel.explain("posts.publish").map((step) => step.id)).toEqual(reversed.explain("posts.publish").map((step) => step.id));
        expect(kernel.explain("posts.publish")[1]).toEqual({ id: "shorten", owner: "links", anchor: { after: "validate" } });
    });

    test("reads as data in the order start runs it, whatever order the plugins are handed in", async () =>
    {
        const plugins = [
            createPosts(),
            createAdder("zeta", [{ id: "last", after: "validate", run: mark("last") }]),
            createAdder("alpha", [{ id: "first", after: "validate", run: mark("first") }]),
        ];
        const kernel = createKernel({ plugins });
        await kernel.start();

        const declared = declarationsOf(plugins, "posts")[0]?.pipelines[0];

        expect(declared?.steps.map((step) => step.id)).toEqual(kernel.explain("posts.publish").map((step) => step.id));
        expect(declared).toMatchObject({ name: "posts.publish", problems: [] });
    });

    test("ends early when a step stops it with an output", async () =>
    {
        const kernel = createKernel({ plugins: [createPosts(), createAdder("cache", [{ id: "cached", after: "validate", run: (_state, _ctx, step) => step.stop({ text: "from cache", marks: [] }) }])] });
        await kernel.start();

        const published = await kernel.context("cache").pipeline("posts.publish").run({ text: "hi", marks: [] });

        expect(published).toEqual({ text: "from cache", marks: [] });
    });

    test("logs its order at start and each step as it runs, never the state", async () =>
    {
        const logged: string[] = [];
        const kernel = createKernel({ plugins: [createPosts()], log: (level, _plugin, line, about) => logged.push(`${level} ${line} ${JSON.stringify(about ?? {})}`) });
        await kernel.start();

        await kernel.context("posts").pipeline("posts.publish").run({ text: "secret", marks: [] });

        expect(logged.some((line) => line.startsWith("debug pipeline \"posts.publish\" runs validate → store"))).toBe(true);
        expect(logged.some((line) => line.startsWith("debug pipeline \"posts.publish\" step \"store\" ok"))).toBe(true);
        expect(logged.join("\n")).not.toContain("secret");
    });
});

describe("a pipeline refuses", () =>
{
    test("at start, an unknown anchor and a taken id, together", async () =>
    {
        const kernel = createKernel({ plugins: [createPosts(), createAdder("links", [
            { id: "a", after: "nowhere", run: mark("a") },
            { id: "store", after: "validate", run: mark("again") },
        ])] });

        const refused = String(await kernel.start().catch((error: unknown) => error));

        expect(refused).toContain("sits beside \"nowhere\", which no step is named");
        expect(refused).toContain("two steps named \"store\"");
    });

    test("at start, an anchor cycle, naming each step in it", async () =>
    {
        const kernel = createKernel({ plugins: [createPosts(), createAdder("loops", [{ id: "x", after: "y", run: mark("x") }, { id: "y", after: "x", run: mark("y") }])] });

        const refused = String(await kernel.start().catch((error: unknown) => error));

        expect(refused).toContain("Step \"x\" from \"loops\" in pipeline \"posts.publish\" is in an anchor cycle");
        expect(refused).toContain("Step \"y\" from \"loops\"");
    });

    test("input or output its schemas refuse, and a failing step, naming it", async () =>
    {
        const kernel = createKernel({ plugins: [createPosts(), createAdder("broken", [{ id: "explode", after: "validate", run: () =>
        {
            throw new Error("disk full");
        } }])] });
        const lossy = createKernel({ plugins: [createPosts({ steps: [{ id: "drop", run: () => ({ text: 1 }) }] })] });
        await kernel.start();
        await lossy.start();

        const badInput = await kernel.context("posts").pipeline("posts.publish").run({ text: 1 }).catch((error: unknown) => error);
        const failed = await kernel.context("posts").pipeline("posts.publish").run({ text: "hi", marks: [] }).catch((error: unknown) => error);
        const badOutput = await lossy.context("posts").pipeline("posts.publish").run({ text: "hi", marks: [] }).catch((error: unknown) => error);

        expect(badInput).toMatchObject({ code: "INVALID_PAYLOAD" });
        expect(failed).toMatchObject({ code: "PIPELINE_FAILED", plugin: "broken", message: "Pipeline \"posts.publish\" stopped at step \"explode\" from \"broken\": disk full" });
        expect(badOutput).toMatchObject({ code: "INVALID_PAYLOAD", message: expect.stringContaining("The last step to run must answer the output") });
    });

    test("a step from a plugin that does not depend on the owner, and a run by one", async () =>
    {
        const stray = createPlugin("stray", { adds: { "posts.publish": [{ id: "x", after: "validate", run: mark("x") }] } });
        const refusing = createKernel({ plugins: [createPosts(), stray] });
        const running = createKernel({ plugins: [createPosts(), createPlugin("stray")] });
        await running.start();

        await expect(refusing.start()).rejects.toThrow(/belongs to "posts", which "stray" does not depend on/);
        expect(() => running.context("stray").pipeline("posts.publish")).toThrow(/Add "posts" to dependsOn/);
    });
});
