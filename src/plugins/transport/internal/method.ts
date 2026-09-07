const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;

const IDEMPOTENT = new Set<string>(["GET", "PUT", "DELETE"]);

export type Method = (typeof METHODS)[number];

export const methods = {
    all: METHODS,

    idempotent: (method: string): boolean =>
    {
        return IDEMPOTENT.has(method);
    },
};
