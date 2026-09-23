import { rankOf } from "./entry";
import type { Level, LogEntry } from "./entry";
import { redactKey, redactText, redacted } from "./redact";

export type ShippedEntry = {
    level: "info" | "warn" | "error";
    at: string;
    plugin?: string;
    line: string;
    about?: Record<string, string | number | boolean | null>;
};

export type ShipperOptions = {
    level: Level;
    send: (entries: readonly ShippedEntry[], isLeaving: boolean) => Promise<number>;
    every: (run: () => void) => void;
    now?: (() => number) | undefined;
};

export type Shipper = {
    write: (entry: LogEntry) => void;
    flush: (isLeaving: boolean) => void;
};

const mostPerRequest = 20;
const mostBytes = 30_000;
const mostText = 500;
const mostKeys = 20;
const pauseAfterThrottleMs = 60_000;
const throttled = 429;

function clip(text: string): string
{
    const clean = redactText(text);

    return clean.length > mostText ? `${clean.slice(0, mostText - 1)}…` : clean;
}

function flat(value: unknown): string | number | boolean | null
{
    if (value === null || typeof value === "number" || typeof value === "boolean")
    {
        return value;
    }

    if (typeof value === "string")
    {
        return clip(value);
    }

    if (value instanceof Error)
    {
        return clip(value.message);
    }

    try
    {
        return clip(JSON.stringify(value) ?? typeof value);
    }
    catch
    {
        return "unserializable";
    }
}

function aboutOf(about: Readonly<Record<string, unknown>>): Record<string, string | number | boolean | null>
{
    return Object.fromEntries(Object.entries(about)
        .slice(0, mostKeys)
        .map(([key, value]) => [key, redactKey(key) ? redacted : flat(value)]));
}

export function shipper(options: ShipperOptions): Shipper
{
    const lowest = Math.max(rankOf(options.level), rankOf("info"));
    const now = options.now ?? Date.now;

    let waiting: ShippedEntry[] = [];
    let pausedUntil = 0;

    const flush = (isLeaving: boolean): void =>
    {
        const batch = waiting.slice(0, mostPerRequest);

        while (batch.length > 1 && JSON.stringify({ entries: batch }).length > mostBytes)
        {
            batch.pop();
        }

        waiting = waiting.slice(batch.length);

        if (batch.length === 0)
        {
            return;
        }

        options.send(batch, isLeaving)
            .then((status) =>
            {
                if (status === throttled)
                {
                    pausedUntil = now() + pauseAfterThrottleMs;
                    waiting = [];
                }
            })
            .catch(() => {});
    };

    options.every(() =>
    {
        flush(false);
    });

    return {
        write: (entry) =>
        {
            if (rankOf(entry.level) < lowest || now() < pausedUntil)
            {
                return;
            }

            const shipped: ShippedEntry = {
                level: entry.level as ShippedEntry["level"],
                at: entry.at,
                line: clip(entry.line),
                ...(entry.plugin === undefined ? {} : { plugin: entry.plugin }),
                ...(entry.about === undefined ? {} : { about: aboutOf(entry.about) }),
            };
            const earlier = waiting.find((other) => other.level === shipped.level && other.plugin === shipped.plugin && other.line === shipped.line);

            if (earlier !== undefined)
            {
                const repeated = earlier.about?.["repeated"];

                earlier.about = { ...earlier.about, repeated: typeof repeated === "number" ? repeated + 1 : 2 };

                return;
            }

            waiting.push(shipped);

            if (waiting.length >= mostPerRequest)
            {
                flush(false);
            }
        },

        flush,
    };
}
