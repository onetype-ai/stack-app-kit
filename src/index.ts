
export { boot, RunningApp } from "./kernel/boot";
export { BootFault } from "./kernel/errors";
export type { BootFaultCode } from "./kernel/errors";
export { Host } from "./kernel/host";
export type { LogLine } from "./kernel/host";
export type { HostPlugin } from "./kernel/plugin";

export { createKernel, definePlugin, KernelFault } from "./plugins/kernel/api";
export { kernelPlugin } from "./plugins/kernel/plugin";
export type {
    Cache,
    HttpClient,
    Command,
    Context,
    SlotContribution,
    Definition,
    Describable,
    Event,
    ListenerFailure,
    FallbackProps,
    KernelFaultCode,
    MountedContribution,
    Hook,
    Kernel,
    Listener,
    LogFn,
    Logger,
    KernelOptions,
    Participant,
    Permission,
    Plugin,
    Realtime,
    RegisteredRoute,
    CallOptions,
    Route,
    DescribableWithSchema,
    Slot,
    PermissionSource,
    ContractProblem,
} from "./plugins/kernel/api";

export * as transport from "./plugins/transport/api";
export { transportPlugin } from "./plugins/transport/plugin";

export * as cache from "./plugins/cache/api";
export { cachePlugin } from "./plugins/cache/plugin";

export * as router from "./plugins/router/api";
export { routerPlugin } from "./plugins/router/plugin";

export { discover, start } from "./plugins/mount/api";
export { mountPlugin } from "./plugins/mount/plugin";
export type { PluginModules, StartedApp, StartOptions } from "./plugins/mount/api";
