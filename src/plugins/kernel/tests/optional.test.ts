import { describe, expect, test } from "vitest";

import { definePlugin } from "../api";
import type { Route } from "../api";

describe("what the contract accepts from a caller who has undefined", () =>
{
    test("a route built from values that may be undefined still compiles", () =>
    {
        const maybeGuard: readonly string[] | undefined = undefined;
        const maybeTitle: string | undefined = undefined;

        const one: Route = {
            path: "/probe",
            component: () => null,
            title: maybeTitle ?? "Probe",
            requires: maybeGuard,
        };

        expect(one.path).toBe("/probe");
    });

    test("so does a definition whose optional keys came from somewhere optional", () =>
    {
        const depends: readonly string[] | undefined = undefined;

        const one = definePlugin("probe", {
            version: "1.0.0",
            describe: "Built from values a caller may not have.",
            dependsOn: depends,
        });

        expect(one.name).toBe("probe");
    });
});
