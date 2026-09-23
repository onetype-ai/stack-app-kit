import { useQuery } from "@tanstack/react-query";
import { screen, waitFor } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { definePlugin } from "@onetype/stack-app-kit";
import { usePlugin } from "@onetype/stack-app-kit/react";
import { ok, openApp } from "../react/app";

import type { ReactNode } from "react";

function Items(): ReactNode
{
    const ctx = usePlugin("items");
    const read = useQuery({ queryKey: ["items"], queryFn: () => ctx.http.get("/items", { query: { page: "1" } }) });
    const failed = useQuery({ queryKey: ["missing"], queryFn: () => ctx.http.get("/missing"), retry: false });

    return (
        <main>
            <p>{read.data === undefined ? "loading" : (read.data as { name: string }[]).map((item) => item.name).join(", ")}</p>
            <p>{failed.isError ? "missing refused" : "missing pending"}</p>
        </main>
    );
}

const items = definePlugin("items", {
    version: "1.0.0",
    describe: "Lists items.",
    routes: [{ path: "/items", title: "Items", component: Items }],
});

describe("an app opened for a test", () =>
{
    test("renders the page at its path against the answers, recording each call without the api base", async () =>
    {
        const opened = await openApp({ path: "/items", plugins: [items], answers: { "GET /items": ok([{ name: "Lamp" }]) } });

        expect(await screen.findByText("Lamp")).toBeTruthy();
        expect(await screen.findByText("missing refused")).toBeTruthy();
        expect(opened.calls.find((call) => call.path === "/items")).toMatchObject({ method: "GET", query: { page: "1" } });
    });

    test("asks the test's answers, then its catch-all, then the preset", async () =>
    {
        await openApp({
            path: "/items",
            plugins: [items],
            answers: { "*": (call) => (call.path === "/items" ? undefined : { status: 500 }) },
            preset: { "GET /items": ok([{ name: "From preset" }]), "GET /missing": ok([]) },
        });

        expect(await screen.findByText("From preset")).toBeTruthy();
        expect(await screen.findByText("missing refused")).toBeTruthy();
    });

    test("records into a list the test gives, with the transport settings it adds", async () =>
    {
        const calls: Parameters<typeof openApp>[0]["calls"] = [];

        const opened = await openApp({ path: "/items", plugins: [items], calls, answers: { "*": ok([]) }, transport: { headers: () => ({ "x-workspace": "w-1" }) } });
        await waitFor(() =>
        {
            expect(calls.length).toBeGreaterThan(0);
        });

        expect(opened.calls).toBe(calls);
        expect(calls[0]?.headers.get("x-workspace")).toBe("w-1");
    });

    test("leaves nothing behind for the next test: fetch is the real one again", () =>
    {
        expect(document.body.textContent).toBe("");
        expect(String(globalThis.fetch)).not.toContain("calls.push");
    });
});
