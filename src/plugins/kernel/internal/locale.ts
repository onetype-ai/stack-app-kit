/** One message: plain text with `{name}` holes, or plural forms chosen by `count` through `Intl.PluralRules`. */
export type Message = string | (Readonly<Partial<Record<Intl.LDMLPluralRule, string>>> & { other: string });

/** A plugin's messages: by locale tag, then by key. The fallback locale holds every key. */
export type Messages = Readonly<Record<string, Readonly<Record<string, Message>>>>;

/** Which locales the application speaks, and the one every plugin's messages must be complete in. */
export type LocaleOptions = {
    supported: readonly string[];
    fallback: string;

    /** The viewer's locale at start: what `locale.negotiate` answered. The fallback when left out. */
    current?: string | undefined;
};

export type LocaleValues = Readonly<Record<string, string | number>>;

/** What a plugin reads its language through. */
export type PluginLocale = {
    current: () => string;
    text: (key: string, values?: LocaleValues) => string;
    format: {
        number: (value: number, options?: Intl.NumberFormatOptions) => string;
        date: (value: Date | number, options?: Intl.DateTimeFormatOptions) => string;
    };

    /** Changes the viewer's locale for every plugin; one outside `supported` is refused. */
    change: (tag: string) => void;

    /** Runs `notify` on every change. Returns a stop. */
    watch: (notify: () => void) => () => void;

    /** The same view read at a fixed tag, whatever the current one: what a component renders while hydrating a page written in another. */
    at: (tag: string) => PluginLocale;
};

function filled(message: string, values: LocaleValues): string
{
    return message.replace(/\{(\w+)\}/g, (whole, name: string) => (values[name] === undefined ? whole : String(values[name])));
}

export function createLocale(options: LocaleOptions, refuse: (message: string) => never)
{
    let current = options.current ?? options.fallback;
    const watchers = new Set<() => void>();
    const numbers = new Map<string, Intl.NumberFormat>();
    const dates = new Map<string, Intl.DateTimeFormat>();

    const change = (tag: string): void =>
    {
        const known = options.supported.find((one) => one.toLowerCase() === tag.toLowerCase());

        if (known === undefined)
        {
            refuse(`locale "${tag}" is not supported (${options.supported.join(", ")}). Change to one of them.`);
        }

        if (known === current)
        {
            return;
        }

        current = known;

        for (const notify of watchers)
        {
            notify();
        }
    };

    const forPlugin = (messages: Messages | undefined, fixed?: string): PluginLocale => ({
        current: () => fixed ?? current,

        text: (key, values = {}) =>
        {
            const tag = fixed ?? current;
            const message = messages?.[tag]?.[key] ?? messages?.[options.fallback]?.[key];

            if (message === undefined)
            {
                return key;
            }

            if (typeof message === "string")
            {
                return filled(message, values);
            }

            const count = typeof values["count"] === "number" ? values["count"] : 0;
            const form = new Intl.PluralRules(tag).select(count);

            return filled(message[form] ?? message.other, values);
        },

        format: {
            number: (value, formatOptions = {}) =>
            {
                const tag = fixed ?? current;
                const id = `${tag}|${JSON.stringify(formatOptions)}`;
                const formatter = numbers.get(id) ?? new Intl.NumberFormat(tag, formatOptions);

                numbers.set(id, formatter);

                return formatter.format(value);
            },

            date: (value, formatOptions = {}) =>
            {
                const tag = fixed ?? current;
                const id = `${tag}|${JSON.stringify(formatOptions)}`;
                const formatter = dates.get(id) ?? new Intl.DateTimeFormat(tag, formatOptions);

                dates.set(id, formatter);

                return formatter.format(value);
            },
        },

        change,

        watch: (notify) =>
        {
            watchers.add(notify);

            return () =>
            {
                watchers.delete(notify);
            };
        },

        at: (tag) => forPlugin(messages, options.supported.find((one) => one.toLowerCase() === tag.toLowerCase()) ?? options.fallback),
    });

    return { forPlugin };
}

export function localeProblems(plugin: string, messages: Messages | undefined, options: LocaleOptions): string[]
{
    if (messages === undefined)
    {
        return [];
    }

    const problems: string[] = [];
    const base = messages[options.fallback];

    for (const tag of Object.keys(messages))
    {
        if (!options.supported.includes(tag))
        {
            problems.push(`"${plugin}" has messages in "${tag}", which is not supported (${options.supported.join(", ")}). Add it to locale.supported, or remove them.`);
        }
    }

    if (base === undefined)
    {
        problems.push(`"${plugin}" has messages but none in the fallback "${options.fallback}". Every key must exist there.`);

        return problems;
    }

    for (const [tag, keys] of Object.entries(messages))
    {
        const missing = Object.keys(keys).filter((key) => base[key] === undefined);

        if (missing.length > 0)
        {
            problems.push(`"${plugin}" has ${missing.map((key) => `"${key}"`).join(", ")} in "${tag}" but not in the fallback "${options.fallback}". Add them there.`);
        }
    }

    return problems;
}
