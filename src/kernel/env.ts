export const rules = {
    text: (name: string, given: unknown, fallback?: string): string | undefined =>
    {
        if (given === undefined)
        {
            return fallback;
        }

        if (typeof given !== "string" || given.length === 0)
        {
            throw new Error(`${name} must be a non-empty string when it is set.`);
        }

        return given;
    },

    required: (name: string, given: unknown): string =>
    {
        const value = rules.text(name, given);

        if (value === undefined)
        {
            throw new Error(`${name} is required and was not set.`);
        }

        return value;
    },

    number: (name: string, given: unknown, fallback: number, min = 0, max = Number.MAX_SAFE_INTEGER): number =>
    {
        const value = rules.text(name, given);

        if (value === undefined)
        {
            return fallback;
        }

        const asNumber = value.trim() === "" ? Number.NaN : Number(value);

        if (!Number.isInteger(asNumber) || asNumber < min || asNumber > max)
        {
            throw new Error(`${name} must be a whole number from ${String(min)} to ${String(max)}. Received "${value}".`);
        }

        return asNumber;
    },

    flag: (name: string, given: unknown, fallback: boolean): boolean =>
    {
        const value = rules.text(name, given);

        if (value === undefined)
        {
            return fallback;
        }

        if (value !== "true" && value !== "false")
        {
            throw new Error(`${name} must be "true" or "false". Received "${value}".`);
        }

        return value === "true";
    },

    list: (given: unknown): readonly string[] =>
    {
        return (typeof given === "string" ? given : "")
            .split(",")
            .map((part) => part.trim())
            .filter(Boolean);
    },

    oneOf: <Allowed extends string>(name: string, given: unknown, allowed: readonly Allowed[], fallback: Allowed): Allowed =>
    {
        const value = rules.text(name, given, fallback) ?? fallback;

        if (!allowed.includes(value as Allowed))
        {
            throw new Error(`${name} must be one of ${allowed.join(", ")}. Received "${value}".`);
        }

        return value as Allowed;
    },
};

/**
 * Configuration rules, refused by name rather than repaired.
 *
 * A bundler replaces `import.meta.env.NAME` where it is written, so reading
 * belongs to the application: it reads the value and passes it to a rule.
 * What counts as legal is then the same everywhere.
 */
export const Env = { rules };
