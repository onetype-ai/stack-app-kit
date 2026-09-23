import type { Host } from "../../kernel/host";
import type { create } from "./internal/logger";
import type { shipper } from "./internal/shipper";

/** What this plugin offers itself as. */
export const NAME = "logs";

/** What `logs.from(host)` answers. */
export type Logs = {
    /** A leveled logger for `start({ log })`, handing every entry at or above `level` to each writer. */
    create: typeof create;

    /** Batches, clips, redacts and sends entries at or above `level` (never below info); a 429 pauses it for a minute. */
    shipper: typeof shipper;
};

/** The logs, for a plugin that declared "logs" in needs. */
export function from(host: Host): Logs | undefined
{
    return host.take<Logs>(NAME);
}

export { create } from "./internal/logger";
export { toConsole } from "./internal/console";
export type { LoggerOptions } from "./internal/logger";
export { shipper } from "./internal/shipper";
export type { ShippedEntry, Shipper, ShipperOptions } from "./internal/shipper";
export { captureErrors } from "./internal/capture";
export type { ErrorSource } from "./internal/capture";
export { postTo } from "./internal/post";
export { levels } from "./internal/entry";
export type { Level, LogEntry, LogWriter } from "./internal/entry";
