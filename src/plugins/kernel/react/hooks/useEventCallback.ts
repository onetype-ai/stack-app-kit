import { useCallback, useInsertionEffect, useRef } from "react";

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
