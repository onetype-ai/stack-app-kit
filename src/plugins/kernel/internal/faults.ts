/**
 * What the kernel refuses.
 *
 * A closed union rather than a string: an application branches on it, and a
 * new member is a compile error everywhere it is handled exhaustively.
 */
export type FaultCode =
    | "DUPLICATE_PLUGIN"
    | "UNKNOWN_DEPENDENCY"
    | "DEPENDENCY_CYCLE"
    | "INVALID_NAME"
    | "INVALID_CONFIG"
    | "INVALID_ROUTE"
    | "INVALID_PAYLOAD"
    | "INVALID_CONTRIBUTION"
    | "UNDECLARED_EVENT"
    | "UNDECLARED_HOOK"
    | "UNDECLARED_SLOT"
    | "UNDECLARED_COMMAND"
    | "UNDECLARED_PERMISSION"
    | "UNDECLARED_DEPENDENCY"
    | "DUPLICATE_ROUTE"
    | "DUPLICATE_SLOT"
    | "DUPLICATE_EVENT"
    | "DUPLICATE_HOOK"
    | "DUPLICATE_COMMAND"
    | "DUPLICATE_PERMISSION"
    | "DUPLICATE_GRANTS"
    | "DUPLICATE_FRAME"
    | "DUPLICATE_PAGE"
    | "PERMISSION_DENIED"
    | "NOT_STARTED";

type Made = {
    plugin?: string;
    detail?: Readonly<Record<string, unknown>>;
    cause?: unknown;
};

/**
 * A refusal, naming the plugin it came from.
 *
 * Three trials of the previous build called startup validation the best part
 * of the system, and what made it so was the message: the plugin, the key,
 * the owner, and what to do about it. A code alone costs an hour.
 */
export class KernelFault extends Error
{
    readonly code: FaultCode;

    readonly plugin: string | undefined;

    readonly detail: Readonly<Record<string, unknown>>;

    constructor(code: FaultCode, message: string, made: Made = {})
    {
        super(message, made.cause === undefined ? undefined : { cause: made.cause });

        this.name = "KernelFault";
        this.code = code;
        this.plugin = made.plugin;
        this.detail = made.detail ?? {};
    }

    override toString(): string
    {
        return this.plugin === undefined
            ? `${this.name} [${this.code}]: ${this.message}`
            : `${this.name} [${this.code}] in plugin "${this.plugin}": ${this.message}`;
    }
}
