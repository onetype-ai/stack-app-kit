import { useCallback, useInsertionEffect, useRef } from "react";

/** Wraps a handler so its identity never changes while always calling the latest version. */
export const useEventCallback = <Args extends readonly unknown[]>(
    handler: (...args: Args) => void,
): ((...args: Args) => void) =>
{
    const latest = useRef(handler);

    useInsertionEffect(() =>
    {
        latest.current = handler;
    });

    return useCallback((...args: Args) =>
    {
        latest.current(...args);
    }, []);
};
