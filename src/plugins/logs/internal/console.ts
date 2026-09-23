import type { LogWriter } from "./entry";

export const toConsole: LogWriter = (entry) =>
{
    console[entry.level](entry.plugin === undefined ? entry.line : `${entry.plugin}: ${entry.line}`, entry.about ?? "");
};
