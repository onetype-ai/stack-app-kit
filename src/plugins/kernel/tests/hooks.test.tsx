import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useRef, useState } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { useDismiss, useEventCallback, useFocusTrap } from "../react/index";

afterEach(cleanup);

describe("useEventCallback", () =>
{
    test("keeps one identity while calling the newest handler", () =>
    {
        const seen: string[] = [];
        const identities = new Set<unknown>();

        function Probe({ label }: { label: string })
        {
            const callback = useEventCallback(() =>
            {
                seen.push(label);
            });

            identities.add(callback);

            return (
                <button type="button" onClick={() => callback()}>
                    fire
                </button>
            );
        }

        const view = render(<Probe label="first" />);

        view.rerender(<Probe label="second" />);
        fireEvent.click(screen.getByText("fire"));

        expect(identities.size).toBe(1);
        expect(seen).toEqual(["second"]);
    });
});

describe("useFocusTrap", () =>
{
    function Trapped({ active }: { active: boolean })
    {
        const ref = useRef<HTMLDivElement | null>(null);

        useFocusTrap(active, ref);

        return (
            <div ref={ref}>
                <button type="button">one</button>
                <button type="button">two</button>
            </div>
        );
    }

    test("moves focus inside when it becomes active", () =>
    {
        render(<Trapped active={true} />);

        expect(document.activeElement?.textContent).toBe("one");
    });

    test("leaves focus alone while inactive", () =>
    {
        render(<Trapped active={false} />);

        expect(document.activeElement?.textContent).not.toBe("one");
    });

    test("wraps from the last back to the first", () =>
    {
        render(<Trapped active={true} />);

        const last = screen.getByText("two");

        last.focus();
        fireEvent.keyDown(last, { key: "Tab" });

        expect(document.activeElement?.textContent).toBe("one");
    });
});

describe("useDismiss", () =>
{
    function Panel({ onDismiss }: { onDismiss: () => void })
    {
        const inside = useRef<HTMLDivElement | null>(null);
        const [open] = useState(true);

        useDismiss(open, inside, undefined, onDismiss);

        return (
            <>
                <div ref={inside}>inside</div>
                <div>outside</div>
            </>
        );
    }

    test("dismisses on a pointer down outside", () =>
    {
        const told = vi.fn();

        render(<Panel onDismiss={told} />);
        fireEvent.pointerDown(screen.getByText("outside"));

        expect(told).toHaveBeenCalledOnce();
    });

    test("stays open on a pointer down inside", () =>
    {
        const told = vi.fn();

        render(<Panel onDismiss={told} />);
        fireEvent.pointerDown(screen.getByText("inside"));

        expect(told).not.toHaveBeenCalled();
    });

    test("dismisses on Escape", () =>
    {
        const told = vi.fn();

        render(<Panel onDismiss={told} />);
        fireEvent.keyDown(document, { key: "Escape" });

        expect(told).toHaveBeenCalledOnce();
    });
});
