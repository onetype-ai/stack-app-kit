export type PublicRule = {
    application: readonly string[];
    suffixes: readonly string[];
};

export const prefix = "VITE_";

const separator = "__";

const secretWords: readonly string[] = ["SECRET", "TOKEN", "KEY", "PASS", "PWD", "AUTH", "BEARER", "SESSION", "COOKIE", "PRIVATE", "CREDENTIAL", "SIGNING"];

export const publicSuffixes: readonly string[] = ["_URL", "_ORIGIN", "_ORIGINS", "_ENABLED", "_MODE", "_LEVEL", "_SIZE", "_LIMIT", "_LOCALE"];

export function prefixOf(plugin: string): string
{
    return `${prefix}${plugin.toUpperCase().replace(/-/g, "_")}${separator}`;
}

export function variableOf(plugin: string, field: string): string
{
    return prefixOf(plugin) + field.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toUpperCase();
}

function problemOf(name: string, rule: PublicRule): string | undefined
{
    if (rule.application.includes(name))
    {
        return undefined;
    }

    if (secretWords.some((word) => name.includes(word)))
    {
        return `${name} reads like a secret, and every ${prefix} value ships inside the public bundle. Keep it on the server, or list it as application-wide if it is public by design.`;
    }

    const at = name.indexOf(separator);
    const field = at === -1 ? "" : name.slice(at + separator.length);

    if (at === -1 || field.length === 0)
    {
        return `${name} is neither a plugin's (${prefix}<PLUGIN>__<FIELD>) nor listed as application-wide.`;
    }

    if (!rule.suffixes.some((suffix) => `_${field}`.endsWith(suffix)))
    {
        return `${name} does not end in a public suffix (${rule.suffixes.join(", ")}). Only addresses, switches, modes, levels and sizes may ship in the bundle.`;
    }

    return undefined;
}

export function problemsOf(names: readonly string[], rule: PublicRule): string[]
{
    return names
        .filter((name) => name.startsWith(prefix))
        .sort()
        .map((name) => problemOf(name, rule))
        .filter((problem): problem is string => problem !== undefined);
}
