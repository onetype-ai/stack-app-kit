export type E2eFaultCode = "PORT_TAKEN" | "NOT_READY" | "UNSAFE_FLAG" | "NO_COMMAND" | "NOT_ON_CI" | "LOCKED";

/** What the end-to-end harness refused, naming the port, service or value and the fix. */
export class E2eFault extends Error
{
    readonly code: E2eFaultCode;

    constructor(code: E2eFaultCode, message: string)
    {
        super(message);
        this.name = "E2eFault";
        this.code = code;
    }
}
