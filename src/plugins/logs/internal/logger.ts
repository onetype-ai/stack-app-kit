import type { Logger } from "../../kernel/api";
import { rankOf } from "./entry";
import type { Level, LogEntry, LogWriter } from "./entry";

export type LoggerOptions = {
    level: Level;
    write: LogWriter | readonly LogWriter[];
    now?: (() => Date) | undefined;
};

const pluginPrefix = /^([a-z][a-z0-9-]{0,63}): /;

export function create(options: LoggerOptions): Logger
{
    const lowest = rankOf(options.level);
    const writers = typeof options.write === "function" ? [options.write] : options.write;
    const now = options.now ?? (() => new Date());

    const at = (level: Level) => (line: string, about?: Readonly<Record<string, unknown>>): void =>
    {
        if (rankOf(level) < lowest)
        {
            return;
        }

        const prefixed = pluginPrefix.exec(line);
        const entry: LogEntry = {
            level,
            at: now().toISOString(),
            plugin: prefixed?.[1],
            line: prefixed === null ? line : line.slice(prefixed[0].length),
            about,
        };

        for (const write of writers)
        {
            write(entry);
        }
    };

    return { debug: at("debug"), info: at("info"), warn: at("warn"), error: at("error") };
}
