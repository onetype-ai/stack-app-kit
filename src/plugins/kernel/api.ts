import type { Host } from "../../kernel/host";
import { createKernel } from "./internal/kernel";
import { definePlugin } from "./internal/define";
import { KernelFault } from "./internal/faults";

/** What this plugin offers itself as. */
export const NAME = "kernel";

export { createKernel, definePlugin, KernelFault };

export type { KernelFaultCode } from "./internal/faults";

export type {
    Cache,
    HttpClient,
    Command,
    Context,
    SlotContribution,
    Definition,
    Describable,
    Event,
    FallbackProps,
    Hook,
    Listener,
    Logger,
    Participant,
    Permission,
    Plugin,
    Realtime,
    CallOptions,
    Route,
    DescribableWithSchema,
    Slot,
} from "./internal/contract";

export type { ListenerFailure } from "./internal/events";
export type { MountedContribution } from "./internal/slots";
export type { PermissionSource } from "./internal/permissions";
export type { Kernel, LogFn, KernelOptions, RegisteredRoute } from "./internal/kernel";
export type { ContractProblem } from "./internal/validate";

export type Runtime = {
    create: typeof createKernel;
    define: typeof definePlugin;
};

export function from(host: Host): Runtime | undefined
{
    return host.take<Runtime>(NAME);
}
