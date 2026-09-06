import { TransportFault } from "./faults";
import { methods } from "./method";

/**
 * Whether trying again could help, and how long to wait.
 *
 * This layer owns retrying. Anything above it must not retry as well: a
 * retrying data layer over a retrying transport multiplies, and three over
 * three became nine requests and a twenty-second wait before the error showed.
 */
export const retry = {
    /** Growing backoff, capped, so a failing server is not hammered. */
    delay: (attempt: number, base: number): number =>
    {
        return Math.min(base * 2 ** attempt, 10_000);
    },

    /**
     * Only an idempotent method may be retried. A POST that timed out may
     * still have been applied, and sending it again would apply it twice.
     */
    should: (cause: unknown, method: string): boolean =>
    {
        if (!(cause instanceof TransportFault))
        {
            return false;
        }

        return cause.retryable && methods.idempotent(method);
    },
};
