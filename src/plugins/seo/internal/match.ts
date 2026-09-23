import type { RegisteredRoute, RouteParams } from "../../kernel/api";

function segmentsOf(path: string): string[]
{
    return path.split("/").filter(Boolean);
}

export function matchRoute(routes: readonly RegisteredRoute[], path: string): { route: RegisteredRoute; params: RouteParams } | undefined
{
    const wanted = segmentsOf(path);

    for (const route of routes)
    {
        const declared = segmentsOf(route.path);

        if (declared.length !== wanted.length)
        {
            continue;
        }

        const params: Record<string, string> = {};
        let matches = true;

        for (const [at, part] of declared.entries())
        {
            const given = wanted[at] ?? "";

            if (part.startsWith("$"))
            {
                try
                {
                    params[part.slice(1)] = decodeURIComponent(given);
                }
                catch
                {
                    matches = false;
                }
            }
            else if (part !== given)
            {
                matches = false;
            }
        }

        if (matches)
        {
            return { route, params };
        }
    }

    return undefined;
}
