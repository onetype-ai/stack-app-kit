import type { RouteParams } from "../../kernel/api";

export function filled(path: string, params: RouteParams): { path: string } | { problem: string }
{
    let problem: string | undefined;

    const written = path.replace(/\$([A-Za-z_]\w*)/g, (_whole, name: string) =>
    {
        const value = params[name];

        if (value === undefined || value === "" || value === "." || value === "..")
        {
            problem ??= `"${path}" was given ${value === undefined ? "no" : `"${value}" as`} ${name}; each parameter must be a non-empty segment other than . or ..`;

            return "";
        }

        return encodeURIComponent(value);
    });

    return problem === undefined ? { path: written } : { problem };
}
