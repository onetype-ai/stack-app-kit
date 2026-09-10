/** What the kernel refuses, and why. */
export type BootFaultCode =
    | "NO_NAME"
    | "NO_BOOT"
    | "REGISTERED_TWICE"
    | "UNKNOWN_NEED"
    | "CYCLE"
    | "NOT_BOOTING"
    | "OFFERED_TWICE"
    | "NO_API";

/** A refusal from the kernel itself, naming the plugin it came from. */
export class BootFault extends Error
{
    readonly code: BootFaultCode;

    readonly plugin: string | undefined;

    constructor(code: BootFaultCode, message: string, plugin?: string, cause?: unknown)
    {
        super(message, cause === undefined ? undefined : { cause });

        this.name = "BootFault";
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
