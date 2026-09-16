import { useEffect } from "react";
import type { RefObject } from "react";

import { useEventCallback } from "./useEventCallback";

/** Calls `onDismiss` on Escape, or on a pointer press outside both the element and its anchor. */
export const useDismiss = (
    isOpen: boolean,
    inside: RefObject<HTMLElement | null>,
    anchor: RefObject<HTMLElement | null> | undefined,
    onDismiss: () => void,
): void =>
{
    const dismiss = useEventCallback(onDismiss);

    useEffect(() =>
    {
        if (!isOpen)
        {
            return;
        }

        const isInside = (target: Node): boolean =>
        {
            return (inside.current?.contains(target) ?? false) || (anchor?.current?.contains(target) ?? false);
        };

        const outside = (event: PointerEvent): void =>
        {
            if (!isInside(event.target as Node))
            {
                dismiss();
            }
        };

        const escaped = (event: KeyboardEvent): void =>
        {
            if (event.key === "Escape")
            {
                event.stopPropagation();
                dismiss();
            }
        };

        document.addEventListener("pointerdown", outside, true);
        document.addEventListener("keydown", escaped);

        return () =>
        {
            document.removeEventListener("pointerdown", outside, true);
            document.removeEventListener("keydown", escaped);
        };
    }, [isOpen, inside, anchor, dismiss]);
};
