import { TransportFault } from "./faults";

/** Joins `baseUrl`, `path` and `query` into one URL, dropping null and undefined values; a relative `baseUrl` stays relative. */
export function address(
    baseUrl: string,
    path: string,
    query?: Readonly<Record<string, string | number | boolean | null | undefined>>,
): string
{
    const absolute = /^[a-z][a-z0-9+.-]*:\/\//i.test(baseUrl);
    const base = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
    const rest = path.replace(/^\/+/, "");

    if (absolute)
    {
        const target = new URL(rest, base);

        // `new URL` lets an absolute or backslash-led path replace the base
        // outright, which sent the headers `sends` contributes — a session
        // token among them — to whatever host the path named.
        if (target.origin !== new URL(base).origin)
        {
            throw new TransportFault("OFF_BASE", `"${path}" leaves ${new URL(base).origin}, and a request carrying this app's headers may not.`, { method: "", path });
        }

        fill(target.searchParams, query);

        return target.toString();
    }

    const parameters = new URLSearchParams();

    fill(parameters, query);

    const search = parameters.toString();

    return `${base}${rest}${search === "" ? "" : `?${search}`}`;
}

function fill(into: URLSearchParams, query?: Readonly<Record<string, string | number | boolean | null | undefined>>): void
{
    for (const [key, value] of Object.entries(query ?? {}))
    {
        if (value === undefined || value === null)
        {
            continue;
        }

        into.set(key, String(value));
    }
}
