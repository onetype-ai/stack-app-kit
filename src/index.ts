/**
 * What an application takes from this package.
 *
 * The one file that names a plugin. Everything else reaches another plugin
 * through the host, by a name it declared in needs, and tools/boundaries.mjs
 * checks that this stays true.
 */

export { boot, Booted } from "./kernel/boot";
export { Fault } from "./kernel/errors";
export type { FaultCode as BootFaultCode } from "./kernel/errors";
export { Host } from "./kernel/host";
export type { Say } from "./kernel/host";
export type { Plugin as HostPlugin } from "./kernel/plugin";

export { createKernel, definePlugin, KernelFault } from "./plugins/kernel/api";
export { plugin as kernelPlugin } from "./plugins/kernel/plugin";
export type {
    Cache,
    Client,
    Command,
    Context,
    Contribution,
    Definition,
    Described,
    Event,
    Failure,
    FallbackProps,
    FaultCode,
    Filled,
    Hook,
    Kernel,
    Listener,
    Log,
    Logger,
    Options,
    Participant,
    Permission,
    Plugin,
    Realtime,
    Registered,
    Request,
    Route,
    Schematic,
    Slot,
    Source,
    Wrong,
} from "./plugins/kernel/api";

export * as transport from "./plugins/transport/api";
export { plugin as transportPlugin } from "./plugins/transport/plugin";

export * as cache from "./plugins/cache/api";
export { plugin as cachePlugin } from "./plugins/cache/plugin";

export * as router from "./plugins/router/api";
export { plugin as routerPlugin } from "./plugins/router/plugin";

export { discover } from "./plugins/mount/internal/discover";
export { start } from "./plugins/mount/internal/start";
export { plugin as mountPlugin } from "./plugins/mount/plugin";
export type { Started, Starting } from "./plugins/mount/api";
