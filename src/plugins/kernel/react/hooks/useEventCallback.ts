import { useCallback, useInsertionEffect, useRef } from "react";

export const useEventCallback = <Args extends readonly unknown[]>(
    handler: (...args: Args) => void,
): ((...args: Args) => void) =>
{
    const held = useRef(handler);

    useInsertionEffect(() =>
    {
        held.current = handler;
    });

    return useCallback((...args: Args) =>
    {
        held.current(...args);
    }, []);
};
