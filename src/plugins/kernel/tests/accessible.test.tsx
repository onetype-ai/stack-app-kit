import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useRef, useState } from "react";
import { afterEach, describe, expect, test } from "vitest";

import { AppBoundary, StreamedText, useFocusTrap, useKernel } from "../react/index";

afterEach(cleanup);

function Thrower({ fails }: { fails: boolean }): React.ReactNode
{
    if (fails)
    {
        throw new Error("broken page");
    }

    return <p>page</p>;
}

describe("the application boundary", () =>
{
    test("shows a page with a way back instead of nothing, and reports what it caught once", () =>
    {
        const reported: unknown[] = [];
        let fails = true;
        const Harness = (): React.ReactNode => <Thrower fails={fails} />;

        render(<AppBoundary onError={(error) => reported.push(error)}><Harness /></AppBoundary>);

        expect(screen.getByRole("alert").textContent).toContain("Something went wrong");
        expect(reported).toEqual([expect.objectContaining({ message: "broken page" })]);

        fails = false;
        fireEvent.click(screen.getByRole("button", { name: "Try again" }));

        expect(screen.getByText("page")).toBeTruthy();
    });

    test("shows the application's own failure page when given one", () =>
    {
        render(<AppBoundary fallback={({ error }) => <p>{`custom: ${(error as Error).message}`}</p>}><Thrower fails /></AppBoundary>);

        expect(screen.getByText("custom: broken page")).toBeTruthy();
    });
});

describe("streamed text", () =>
{
    test("is busy and unannounced while it streams, then announced once, whole", () =>
    {
        const shown = render(<StreamedText text="Hel" streaming label="Assistant" />);
        const status = screen.getByRole("status");

        expect(screen.getByText("Hel").getAttribute("aria-busy")).toBe("true");
        expect(status.textContent).toBe("");

        shown.rerender(<StreamedText text="Hello there" streaming label="Assistant" />);
        expect(status.textContent).toBe("");

        shown.rerender(<StreamedText text="Hello there" streaming={false} label="Assistant" />);

        expect(status.textContent).toBe("Assistant: Hello there");
        expect(screen.getByText("Hello there").getAttribute("aria-busy")).toBe("false");
    });

    test("does not announce text that never streamed, like a message from history", () =>
    {
        render(<StreamedText text="An old message" streaming={false} />);

        expect(screen.getByRole("status").textContent).toBe("");
    });
});

describe("a focus trap closing", () =>
{
    test("returns focus to what held it before it opened", () =>
    {
        function Dialog(): React.ReactNode
        {
            const [open, setOpen] = useState(false);
            const ref = useRef<HTMLDivElement>(null);

            useFocusTrap(open, ref);

            return (
                <>
                    <button type="button" onClick={() => setOpen(true)}>open</button>
                    {open && <div ref={ref}><button type="button" onClick={() => setOpen(false)}>close</button></div>}
                </>
            );
        }

        render(<Dialog />);
        const opener = screen.getByRole("button", { name: "open" });
        opener.focus();

        act(() =>
        {
            opener.click();
        });
        expect(document.activeElement?.textContent).toBe("close");

        act(() =>
        {
            screen.getByRole("button", { name: "close" }).click();
        });

        expect(document.activeElement).toBe(opener);
    });
});

describe("a hook used outside the provider", () =>
{
    test("refuses with the kernel's fault, naming where to render it", () =>
    {
        function Reader(): React.ReactNode
        {
            useKernel();

            return null;
        }

        const failed = (() =>
        {
            try
            {
                render(<Reader />);
            }
            catch (error)
            {
                return error;
            }

            return undefined;
        })();

        expect(failed).toMatchObject({ code: "NOT_STARTED", message: expect.stringContaining("KernelProvider") });
    });
});
