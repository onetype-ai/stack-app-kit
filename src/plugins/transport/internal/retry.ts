import { TransportFault } from "./faults";
import { methods } from "./method";

export const retry = {
    delayMs: (attempt: number, baseMs: number, random: () => number): number =>
    {
        const ceiling = Math.min(baseMs * 2 ** attempt, 10_000);

        return Math.round(ceiling / 2 + (random() * ceiling) / 2);
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
