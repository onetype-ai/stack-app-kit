
export { boot, BootedKernel } from "./kernel/boot";
export { Env } from "./kernel/env";
export { serving } from "./kernel/vite";
export { BootFault } from "./kernel/errors";
export type { BootFaultCode } from "./kernel/errors";
export { Host } from "./kernel/host";
export type { HostLog } from "./kernel/host";
export type { HostPlugin } from "./kernel/plugin";

export { createKernel, declarationsOf, definePlugin, KernelFault } from "./plugins/kernel/api";
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
    Declaration,
    DeclaredCommand,
    DeclaredContribution,
    DeclaredEntry,
    DeclaredRoute,
    Pages,
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

export * as logs from "./plugins/logs/api";
export { logsPlugin } from "./plugins/logs/plugin";
export * as settings from "./plugins/settings/api";
export { settingsPlugin } from "./plugins/settings/plugin";
export { discover, start } from "./plugins/mount/api";
export { mountPlugin } from "./plugins/mount/plugin";
export type { PluginModules, StartedApp, StartOptions } from "./plugins/mount/api";
export type { Serving, ServingOptions } from "./kernel/vite";
export type { Frame, Router, RouterOptions } from "./plugins/router/api";
export type { RouterBuilding } from "./plugins/mount/api";
