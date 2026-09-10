/** What the kernel refuses. */
export type KernelFaultCode =
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
    | "UNGRANTABLE_PERMISSION"
    | "DUPLICATE_HEADER"
    | "DUPLICATE_FRAME"
    | "DUPLICATE_PAGE"
    | "PERMISSION_DENIED"
    | "NOT_STARTED";

type KernelFaultDetail = {
    plugin?: string;
    detail?: Readonly<Record<string, unknown>>;
    cause?: unknown;
};

/** A refusal, naming the plugin it came from. */
export class KernelFault extends Error
{
    readonly code: KernelFaultCode;

    readonly plugin: string | undefined;

    readonly detail: Readonly<Record<string, unknown>>;

    constructor(code: KernelFaultCode, message: string, about: KernelFaultDetail = {})
    {
        super(message, about.cause === undefined ? undefined : { cause: about.cause });

        this.name = "KernelFault";
        this.code = code;
        this.plugin = about.plugin;
        this.detail = about.detail ?? {};
    }

    override toString(): string
    {
        return this.plugin === undefined
            ? `${this.name} [${this.code}]: ${this.message}`
            : `${this.name} [${this.code}] in plugin "${this.plugin}": ${this.message}`;
    }
}
