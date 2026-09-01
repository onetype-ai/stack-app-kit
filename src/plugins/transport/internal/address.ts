/**
 * Where a request goes.
 *
 * A base may be absolute ("https://api.example.test") or relative to wherever
 * the page is served from ("/api"), and the second is what an application
 * behind a proxy actually passes. `new URL` cannot resolve against a relative
 * base at all, so that case is joined by hand.
 *
 * A query value is serialised by URLSearchParams and never by hand: a string
 * quoted into a parameter silently breaks the link someone shares.
 */
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
