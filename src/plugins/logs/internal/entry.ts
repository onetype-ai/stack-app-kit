import { KernelFault } from "../../kernel/api";

export const levels = ["debug", "info", "warn", "error"] as const;

export type Level = (typeof levels)[number];

export type LogEntry = {
    level: Level;
    at: string;
    plugin: string | undefined;
    line: string;
    about: Readonly<Record<string, unknown>> | undefined;
};

export type LogWriter = (entry: LogEntry) => void;

export function rankOf(level: string): number
{
    const rank = levels.indexOf(level as Level);

    if (rank === -1)
    {
        throw new KernelFault("INVALID_CONFIG", `logs: level "${level}" is not one of ${levels.join(", ")}.`);
    }

    return rank;
}
