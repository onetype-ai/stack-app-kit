import type { Logger } from "../../kernel/api";

export type ErrorSource = {
    addEventListener: (kind: string, listener: (event: unknown) => void) => void;
    removeEventListener: (kind: string, listener: (event: unknown) => void) => void;
};

function messageOf(cause: unknown): string
{
    if (cause instanceof Error)
    {
        return cause.message;
    }

    return typeof cause === "string" ? cause : "an unknown value was thrown";
}

export function captureErrors(log: Logger, source: ErrorSource): () => void
{
    const uncaught = (event: unknown): void =>
    {
        const failure = event as { error?: unknown; message?: unknown; filename?: unknown; lineno?: unknown };

        log.error(`uncaught error: ${messageOf(failure.error ?? failure.message)}`, {
            ...(typeof failure.filename === "string" && { file: failure.filename }),
            ...(typeof failure.lineno === "number" && { line: failure.lineno }),
        });
    };

    const unhandled = (event: unknown): void =>
    {
        log.error(`unhandled rejection: ${messageOf((event as { reason?: unknown }).reason)}`);
    };

    source.addEventListener("error", uncaught);
    source.addEventListener("unhandledrejection", unhandled);

    return () =>
    {
        source.removeEventListener("error", uncaught);
        source.removeEventListener("unhandledrejection", unhandled);
    };
}
