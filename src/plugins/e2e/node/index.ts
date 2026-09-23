import { launch } from "./browsers";
import { bootEnv } from "./env";
import { startHosts, startSecureHosts } from "./hosts";
import { freePorts } from "./ports";
import { startStack } from "./stack";

export { E2eFault } from "./faults";
export type { E2eFaultCode } from "./faults";
export type { LaunchOptions, LaunchedBrowser, WatchedPage } from "./browsers";
export type { Pages, RunningHosts, RunningSecureHosts } from "./hosts";
export type { RunningStack, ServiceOptions, StackOptions } from "./stack";

/** Starting the application's services on strict ports, and stopping only them. */
export const Stack = { start: startStack, freePorts };

/** A browser holding the machine-wide lock, whose pages record what went wrong. */
export const Browsers = { launch };

/** Static fixture pages, plain or over a per-run certificate. */
export const Hosts = { start: startHosts, startSecure: startSecureHosts };

export { bootEnv };
