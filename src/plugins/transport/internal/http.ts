import type { Request } from "../api";
import { address } from "./address";
import type { Answered, Channel } from "./channel";
import { TransportFault } from "./faults";

type Settings = {
    baseUrl: string;
    timeout: number;
    headers?: (() => Readonly<Record<string, string>>) | undefined;
};

/** The channel that is always available. */
export function http(settings: Settings): Channel
{
    return {
        name: "http",

        open: () =>
        {
            return true;
        },

        send: async (request: Request): Promise<Answered> =>
        {
            const holder = new AbortController();
            const timer = setTimeout(() => holder.abort(), settings.timeout);
            const cancel = (): void =>
            {
                holder.abort();
            };

            request.signal?.addEventListener("abort", cancel);

            try
            {
                const response = await fetch(address(settings.baseUrl, request.path, request.query), {
                    method: request.method,
                    credentials: "same-origin",
                    signal: holder.signal,
                    headers: {
                        Accept: "application/json",
                        ...(request.body !== undefined && { "Content-Type": "application/json" }),
                        ...settings.headers?.(),
                        ...request.headers,
                    },
                    ...(request.body !== undefined && { body: JSON.stringify(request.body) }),
                });

                if (!response.ok)
                {
                    // The body carries what the server rejected, which a form
                    // needs to show against the right field. An error that
                    // dropped it made server-side validation unreachable.
                    let body: unknown;

                    try
                    {
                        body = await response.json();
                    }
                    catch
                    {
                        body = undefined;
                    }

                    throw TransportFault.fromStatus(response.status, {
                        method: request.method,
                        path: request.path,
                        body,
                    });
                }

                if (response.status === 204)
                {
                    return { status: 204, body: undefined, carried: "http" };
                }

                try
                {
                    return { status: response.status, body: await response.json(), carried: "http" };
                }
                catch (cause)
                {
                    throw new TransportFault("MALFORMED", "The server returned a body that is not valid JSON.", {
                        method: request.method,
                        path: request.path,
                        status: response.status,
                        cause,
                    });
                }
            }
            catch (cause)
            {
                throw shape(cause, request, holder, settings.timeout);
            }
            finally
            {
                clearTimeout(timer);
                request.signal?.removeEventListener("abort", cancel);
            }
        },
    };
}

/**
 * What a thrown thing means.
 *
 * The caller's own abort and our timeout both surface as one AbortError, and
 * they are not the same event: one is the caller changing its mind, the other
 * is a server that never answered and may answer next time.
 */
function shape(cause: unknown, request: Request, holder: AbortController, timeout: number): unknown
{
    if (cause instanceof TransportFault)
    {
        return cause;
    }

    if (request.signal?.aborted === true)
    {
        return new TransportFault("ABORTED", "The request was cancelled by the caller.", {
            method: request.method,
            path: request.path,
            cause,
        });
    }

    if (holder.signal.aborted)
    {
        return new TransportFault("TIMEOUT", `The request did not complete within ${timeout}ms.`, {
            method: request.method,
            path: request.path,
            retryable: true,
            cause,
        });
    }

    return new TransportFault("NETWORK", "The request could not reach the server.", {
        method: request.method,
        path: request.path,
        retryable: true,
        cause,
    });
}
