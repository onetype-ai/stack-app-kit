/** What a request was refused for. A closed union, so a caller can branch. */
export type FaultCode =
    | "NETWORK"
    | "TIMEOUT"
    | "ABORTED"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "RATE_LIMITED"
    | "SERVER"
    | "CLIENT"
    | "MALFORMED";

type FaultDetail = {
    method: string;
    path: string;
    status?: number;
    retryable?: boolean;
    body?: unknown;
    cause?: unknown;
};

/**
 * A refused request, carrying what it was and what came back.
 *
 * `body` is what the server sent with the refusal: a form needs the
 * field-level errors inside it, and an error that dropped them made
 * server-side validation unreachable.
 */
export class TransportFault extends Error
{
    readonly code: FaultCode;

    readonly status: number | undefined;

    readonly method: string;

    readonly path: string;

    readonly retryable: boolean;

    readonly body: unknown;

    constructor(code: FaultCode, message: string, about: FaultDetail)
    {
        super(message, about.cause === undefined ? undefined : { cause: about.cause });

        this.name = "TransportFault";
        this.code = code;
        this.status = about.status;
        this.method = about.method;
        this.path = about.path;
        this.retryable = about.retryable ?? false;
        this.body = about.body;
    }

    /** What a status means, and whether trying again could help. */
    static fromStatus(status: number, about: { method: string; path: string; body?: unknown }): TransportFault
    {
        const known: Readonly<Record<number, { code: FaultCode; message: string }>> = {
            400: { code: "CLIENT", message: "The request was rejected as invalid." },
            401: { code: "UNAUTHORIZED", message: "The request was rejected as unauthenticated." },
            403: { code: "FORBIDDEN", message: "The request was rejected as not permitted." },
            404: { code: "NOT_FOUND", message: "The requested resource does not exist." },
            409: { code: "CONFLICT", message: "The request conflicts with the current state." },
            429: { code: "RATE_LIMITED", message: "Too many requests were about." },
        };

        const match = known[status];

        if (match !== undefined)
        {
            return new TransportFault(match.code, match.message, {
                ...about,
                status,
                retryable: status === 429,
            });
        }

        if (status >= 500)
        {
            return new TransportFault("SERVER", "The server failed to handle the request.", {
                ...about,
                status,
                retryable: true,
            });
        }

        return new TransportFault("CLIENT", `The request was rejected with status ${status}.`, { ...about, status });
    }

    override toString(): string
    {
        const at = this.status === undefined ? "" : ` -> ${this.status}`;

        return `${this.name} [${this.code}] ${this.method} ${this.path}${at}: ${this.message}`;
    }
}
