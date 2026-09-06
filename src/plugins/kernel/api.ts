import type { Host } from "../../kernel/host";
import { createKernel } from "./internal/kernel";
import { definePlugin } from "./internal/define";
import { KernelFault } from "./internal/faults";

/** What this plugin offers itself as. */
export const NAME = "kernel";

export { createKernel, definePlugin, KernelFault };

export type { FaultCode } from "./internal/faults";

export type {
    Cache,
    Client,
    Command,
    Context,
    Contribution,
    Definition,
    Described,
    Event,
    FallbackProps,
    Hook,
    Listener,
    Logger,
    Participant,
    Permission,
    Plugin,
    Realtime,
    Request,
    Route,
    Schematic,
    Slot,
} from "./internal/contract";

export type { Failure } from "./internal/events";
export type { PlacedContribution } from "./internal/slots";
export type { Source } from "./internal/permissions";
export type { Kernel, Log, Options, Registered } from "./internal/kernel";
export type { ContractProblem } from "./internal/validate";

/** What this plugin offers: the way to build a kernel for an application. */
export type Runtime = {
    create: typeof createKernel;
    define: typeof definePlugin;
};

/** The runtime, for a plugin that declared "kernel" in needs. */
export function from(host: Host): Runtime | undefined
{
    return host.take<Runtime>(NAME);
}
