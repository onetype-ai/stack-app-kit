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
    Pages,
    Participant,
    Permission,
    Plugin,
    Realtime,
    Pipeline,
    PipelineStep,
    Registry,
    RegistryAccess,
    CallOptions,
    UploadOptions,
    Route,
    RouteParams,
    DescribableWithSchema,
    Slot,
} from "./internal/contract";

export { declarationsOf } from "./internal/declared";
export { checkHead, renderTags, tagsOf } from "./internal/head";
export type { Head, HeadProblem, HeadTag } from "./internal/head";
export type { LocaleOptions, LocaleValues, Message, Messages, PluginLocale } from "./internal/locale";
export type {
    Declaration,
    DeclaredCommand,
    DeclaredContribution,
    DeclaredEntry,
    DeclaredRoute,
    DeclaredRegistry,
    DeclaredAddition,
} from "./internal/declared";

export type { ListenerFailure } from "./internal/events";
export type { MountedContribution } from "./internal/slots";
export type { RegistryEntry } from "./internal/registries";
export type { ExplainedStep } from "./internal/pipelines";
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
