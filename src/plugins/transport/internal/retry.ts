import { TransportFault } from "./faults";
import { methods } from "./method";

export const retry = {
    delay: (attempt: number, base: number): number =>
    {
        return Math.min(base * 2 ** attempt, 10_000);
    },

    should: (cause: unknown, method: string): boolean =>
    {
        if (!(cause instanceof TransportFault))
        {
            return false;
        }

        return cause.retryable && methods.idempotent(method);
    },
};
