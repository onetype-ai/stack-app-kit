import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";

import { createKernel, definePlugin } from "../api";
import type { LocaleOptions, Messages } from "../api";
import { KernelProvider, useLocale } from "../react/index";

afterEach(cleanup);

const languages: LocaleOptions = { supported: ["en", "de"], fallback: "en", current: "de" };

function items(messages: Messages)
{
    return definePlugin("items", { version: "1.0.0", describe: "Lists items.", messages });
}

async function started(messages: Messages, locale: LocaleOptions = languages)
{
    const kernel = createKernel({ plugins: [items(messages)], locale });

    await kernel.start();

    return kernel;
}

const catalogue: Messages = {
    en: { empty: "No items yet", count: { one: "{count} item", other: "{count} items" }, only: "Only in English", greeting: "Hello {name}, {missing}" },
    de: { empty: "Noch keine Einträge", count: { one: "{count} Eintrag", other: "{count} Einträge" } },
};

describe("a plugin's text", () =>
{
    test("reads the viewer's locale, falls back to the fallback's key, then to the key itself", async () =>
    {
        const locale = (await started(catalogue)).context("items").locale;

        expect([locale.text("empty"), locale.text("only"), locale.text("nowhere")]).toEqual(["Noch keine Einträge", "Only in English", "nowhere"]);
    });

    test("fills its holes and picks the plural form the locale's rules name", async () =>
    {
        const locale = (await started(catalogue)).context("items").locale;

        expect([locale.text("count", { count: 1 }), locale.text("count", { count: 3 })]).toEqual(["1 Eintrag", "3 Einträge"]);
        expect(locale.text("greeting", { name: "Ana" })).toBe("Hello Ana, {missing}");
    });

    test("formats numbers and dates for the viewer", async () =>
    {
        const locale = (await started(catalogue)).context("items").locale;

        expect(locale.format.number(1234.5)).toBe("1.234,5");
    });
});

describe("changing the locale", () =>
{
    test("reaches every plugin and tells whoever watches, and refuses a tag nobody supports", async () =>
    {
        const kernel = await started(catalogue);
        const locale = kernel.context("items").locale;
        let told = 0;
        locale.watch(() =>
        {
            told += 1;
        });

        locale.change("EN");

        expect([locale.current(), locale.text("empty"), told]).toEqual(["en", "No items yet", 1]);
        expect(() => locale.change("fr")).toThrow(expect.objectContaining({ code: "INVALID_CONFIG", message: expect.stringContaining("en, de") }));
    });

    test("re-renders a component reading it", async () =>
    {
        const kernel = await started(catalogue);

        function Empty(): React.ReactNode
        {
            return <p>{useLocale("items").text("empty")}</p>;
        }

        render(<KernelProvider kernel={kernel}><Empty /></KernelProvider>);
        act(() =>
        {
            kernel.context("items").locale.change("en");
        });

        expect(screen.getByText("No items yet")).toBeTruthy();
    });
});

describe("messages at start", () =>
{
    test("are refused when a key is missing from the fallback, or a locale is not supported, all at once", async () =>
    {
        const failed = await started({ en: { empty: "x" }, de: { empty: "y", extra: "z" }, fr: { empty: "w" } }).catch((error: unknown) => error);

        expect(failed).toMatchObject({ message: expect.stringContaining("\"extra\" in \"de\" but not in the fallback") });
        expect(failed).toMatchObject({ message: expect.stringContaining("messages in \"fr\", which is not supported") });
    });

    test("are refused without the fallback locale", async () =>
    {
        const failed = await started({ de: { empty: "y" } }).catch((error: unknown) => error);

        expect(failed).toMatchObject({ message: expect.stringContaining("none in the fallback \"en\"") });
    });
});
