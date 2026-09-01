const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;

/**
 * The methods that may be retried, or moved between channels.
 *
 * A dropped socket mid-request must not re-send a POST over HTTP: the socket
 * may already have delivered it, and the caller would have applied it twice.
 */
const IDEMPOTENT = new Set<string>(["GET", "PUT", "DELETE"]);

export type Method = (typeof METHODS)[number];

export const methods = {
    all: METHODS,

    idempotent: (method: string): boolean =>
    {
        return IDEMPOTENT.has(method);
    },
};
