import { cleanup, render, screen } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, describe, expect, test } from "vitest";

import { useStore } from "../react/index";

import type { ReactNode } from "react";

afterEach(cleanup);

function createStore(start: number)
{
    const listeners = new Set<() => void>();

    let current = start;

    return {
        watchers: () => listeners.size,
        set: (next: number): void =>
        {
            current = next;

            for (const notify of listeners)
            {
                notify();
            }
        },
        watch: (notify: () => void): (() => void) =>
        {
            listeners.add(notify);

            return () =>
            {
                listeners.delete(notify);
            };
        },
        read: (): number => current,
    };
}

describe("a value a service keeps", () =>
{
    test("shows what it holds now, before anything moves", () =>
    {
        const store = createStore(7);

        function Badge(): ReactNode
        {
            return <p>{useStore(store.watch, store.read)}</p>;
        }

        render(<Badge />);

        expect(screen.getByText("7")).toBeDefined();
    });

    test("and re-renders when it moves", async () =>
    {
        const store = createStore(0);

        function Badge(): ReactNode
        {
            return <p>{useStore(store.watch, store.read)}</p>;
        }

        render(<Badge />);
        store.set(3);

        expect(await screen.findByText("3")).toBeDefined();
    });

    test("stops listeners when the component leaves", () =>
    {
        const store = createStore(0);

        function Badge(): ReactNode
        {
            return <p>{useStore(store.watch, store.read)}</p>;
        }

        const current = render(<Badge />);

        expect(store.watchers()).toBe(1);

        current.unmount();

        expect(store.watchers()).toBe(0);
    });

    test("watches once under StrictMode, not twice", () =>
    {
        const store = createStore(0);

        function Badge(): ReactNode
        {
            return <p>{useStore(store.watch, store.read)}</p>;
        }

        render(<StrictMode><Badge /></StrictMode>);

        expect(store.watchers()).toBe(1);
    });

    test("and does not resubscribe when the caller passes a new closure", async () =>
    {
        const store = createStore(0);
        let subscribed = 0;

        const watch = (notify: () => void): (() => void) =>
        {
            subscribed += 1;

            return store.watch(notify);
        };

        function Badge(): ReactNode
        {
            const current = useStore((notify) => watch(notify), () => store.read());

            return <p>{current}</p>;
        }

        render(<Badge />);
        store.set(1);
        await screen.findByText("1");
        store.set(2);
        await screen.findByText("2");

        expect(subscribed).toBe(1);
    });

    test("a read answering a new value every call is refused, not left to loop", () =>
    {
        function Screen(): ReactNode
        {
            useStore(() => () => undefined, () => ({ n: 1 }));

            return null;
        }

        expect(() => render(<Screen />)).toThrow(/re-renders forever/);
    });

    test("a read answering the value the service holds is left alone", () =>
    {
        const store = createStore(7);

        function Screen(): ReactNode
        {
            return <p>{useStore((notify) => store.watch(notify), () => store.read())}</p>;
        }

        render(<Screen />);

        expect(screen.getByText("7")).toBeDefined();
    });
});
