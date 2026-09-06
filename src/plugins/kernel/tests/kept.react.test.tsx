import { cleanup, render, screen } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, describe, expect, test } from "vitest";

import { useKept } from "../react/index";

import type { ReactNode } from "react";

afterEach(cleanup);

/** What a service looks like when it keeps something: a value, and a way to hear it move. */
function keeping(start: number)
{
    const watching = new Set<() => void>();

    let current = start;

    return {
        watchers: () => watching.size,
        set: (next: number): void =>
        {
            current = next;

            for (const told of watching)
            {
                told();
            }
        },
        watch: (told: () => void): (() => void) =>
        {
            watching.add(told);

            return () =>
            {
                watching.delete(told);
            };
        },
        read: (): number => current,
    };
}

describe("a value a service keeps", () =>
{
    test("shows what it holds now, before anything moves", () =>
    {
        const kept = keeping(7);

        function Badge(): ReactNode
        {
            return <p>{useKept(kept.watch, kept.read)}</p>;
        }

        render(<Badge />);

        expect(screen.getByText("7")).toBeDefined();
    });

    test("and re-renders when it moves", async () =>
    {
        const kept = keeping(0);

        function Badge(): ReactNode
        {
            return <p>{useKept(kept.watch, kept.read)}</p>;
        }

        render(<Badge />);
        kept.set(3);

        expect(await screen.findByText("3")).toBeDefined();
    });

    /** A component that leaves and keeps watching is a leak nothing reports. */
    test("stops watching when the component leaves", () =>
    {
        const kept = keeping(0);

        function Badge(): ReactNode
        {
            return <p>{useKept(kept.watch, kept.read)}</p>;
        }

        const current = render(<Badge />);

        expect(kept.watchers()).toBe(1);

        current.unmount();

        expect(kept.watchers()).toBe(0);
    });

    test("watches once under StrictMode, not twice", () =>
    {
        const kept = keeping(0);

        function Badge(): ReactNode
        {
            return <p>{useKept(kept.watch, kept.read)}</p>;
        }

        render(<StrictMode><Badge /></StrictMode>);

        expect(kept.watchers()).toBe(1);
    });

    /**
     * A component passing a new closure every render must not resubscribe:
     * that would tear down and rebuild the subscription on every paint.
     */
    test("and does not resubscribe when the caller passes a new closure", async () =>
    {
        const kept = keeping(0);
        let subscribed = 0;

        const watch = (told: () => void): (() => void) =>
        {
            subscribed += 1;

            return kept.watch(told);
        };

        function Badge(): ReactNode
        {
            const current = useKept((told) => watch(told), () => kept.read());

            return <p>{current}</p>;
        }

        render(<Badge />);
        kept.set(1);
        await screen.findByText("1");
        kept.set(2);
        await screen.findByText("2");

        expect(subscribed).toBe(1);
    });
});
