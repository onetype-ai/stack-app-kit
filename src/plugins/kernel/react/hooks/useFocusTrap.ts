import { useEffect } from "react";
import type { RefObject } from "react";

const focusable = [
    "a[href]",
    "button:not(:disabled)",
    "input:not(:disabled)",
    "select:not(:disabled)",
    "textarea:not(:disabled)",
    "[tabindex]:not([tabindex='-1'])",
].join(",");

export const useFocusTrap = (active: boolean, ref: RefObject<HTMLElement | null>): void =>
{
    useEffect(() =>
    {
        const container = ref.current;

        if (!active || container === null)
        {
            return;
        }

        const restore = document.activeElement as HTMLElement | null;
        const first = container.querySelector<HTMLElement>(focusable);

        (first ?? container).focus();

        const cycle = (event: KeyboardEvent): void =>
        {
            if (event.key !== "Tab")
            {
                return;
            }

            const all = Array.from(container.querySelectorAll<HTMLElement>(focusable));
            const edge = event.shiftKey ? all[0] : all[all.length - 1];

            if (edge !== undefined && document.activeElement === edge)
            {
                event.preventDefault();
                (event.shiftKey ? all[all.length - 1] : all[0])?.focus();
            }
        };

        container.addEventListener("keydown", cycle);

        return () =>
        {
            container.removeEventListener("keydown", cycle);
            restore?.focus();
        };
    }, [active, ref]);
};
