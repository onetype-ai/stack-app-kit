import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";

const inherited = ["PATH", "HOME", "TMPDIR", "LANG", "SHELL", "USER"] as const;

export function bootEnv(file: string): Record<string, string>
{
    return Object.fromEntries(Object.entries(parseEnv(readFileSync(file, "utf8"))).filter((entry): entry is [string, string] => entry[1] !== undefined));
}

export function composeEnv(given: Readonly<Record<string, string>>, origins: Readonly<Record<string, string>>): Record<string, string>
{
    const base: Record<string, string> = { NODE_ENV: "development" };

    for (const name of inherited)
    {
        const value = process.env[name];

        if (value !== undefined)
        {
            base[name] = value;
        }
    }

    const filled = Object.fromEntries(Object.entries(given).map(([name, value]) => [name, value.replace(/\{([a-z][\w-]*)\}/g, (whole, service: string) => origins[service] ?? whole)]));

    return { ...base, ...filled };
}
