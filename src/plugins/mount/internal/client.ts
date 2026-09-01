import type { Client, Request } from "../../kernel/api";
import type { Transport } from "../../transport/api";

/**
 * The five-verb client the kernel hands plugins, over one transport.
 *
 * A method per verb rather than one `request` taking a method: a plugin
 * writing `http.post` cannot accidentally send a GET, and the shape reads the
 * way the call site thinks.
 */
export function client(transport: Transport): Client
{
    const send = (method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE") =>
        async (path: string, request: Request = {}): Promise<unknown> =>
            transport.request({
                method,
                path,
                ...(request.query !== undefined && { query: request.query }),
                ...(request.body !== undefined && { body: request.body }),
                ...(request.headers !== undefined && { headers: request.headers }),
                ...(request.signal !== undefined && { signal: request.signal }),
            });

    return {
        get: send("GET"),
        post: send("POST"),
        put: send("PUT"),
        patch: send("PATCH"),
        delete: send("DELETE"),
    };
}
