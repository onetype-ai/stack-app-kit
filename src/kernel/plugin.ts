import type { Host } from "./host";

/**
 * What one of our plugins declares about itself.
 *
 * Ours, not the application's: an application plugin is a value passed to the
 * kernel plugin's own registry, and never reaches this one.
 */
export type Plugin = {
    /** The folder, the module and the key other plugins take it by. */
    name: string;

    /** Plugin names whose api this one calls. Boot order follows. */
    needs?: readonly string[];

    /**
     * Wiring: read config, offer an api, subscribe, claim a hook point.
     *
     * Must not do work. No requests, no sockets, no timers, no DOM: a plugin
     * that acted here would act before the ones it needs had wired.
     */
    boot: (host: Host) => void;

    /** Where work begins, in boot order. Optional. */
    start?: (host: Host) => void | Promise<void>;

    /** Unwinds it, in reverse. Optional. */
    stop?: (host: Host) => void | Promise<void>;
};
