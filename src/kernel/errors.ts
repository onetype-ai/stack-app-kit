/**
 * What the kernel refuses, and why.
 *
 * A code is a closed union rather than a string: a caller branches on it, and
 * a new member is a compile error everywhere it is handled exhaustively.
 */
export type FaultCode =
    | "NO_NAME"
    | "NO_BOOT"
    | "REGISTERED_TWICE"
    | "UNKNOWN_NEED"
    | "CYCLE"
    | "NOT_BOOTING"
    | "OFFERED_TWICE"
    | "NO_API";

/**
 * A refusal from the kernel itself, naming the plugin it came from.
 *
 * Never a bare Error: a caller cannot match on one, so it becomes "something
 * went wrong" in someone else's console.
 */
export class Fault extends Error
{
    readonly code: FaultCode;

    readonly plugin: string | undefined;

    constructor(code: FaultCode, message: string, plugin?: string, cause?: unknown)
    {
        super(message, cause === undefined ? undefined : { cause });

        this.name = "Fault";
        this.code = code;
        this.plugin = plugin;
    }

    override toString(): string
    {
        return this.plugin === undefined
            ? `${this.name} [${this.code}]: ${this.message}`
            : `${this.name} [${this.code}] in "${this.plugin}": ${this.message}`;
    }
}
