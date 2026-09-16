import { TransportFault } from "./faults";
import { methods } from "./method";

export const retry = {
    delayMs: (attempt: number, baseMs: number): number =>
    {
        return Math.min(baseMs * 2 ** attempt, 10_000);
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
