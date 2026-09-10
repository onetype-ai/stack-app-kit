import type { Host } from "./host";

/** What one of our plugins declares about itself. */
export type HostPlugin = {
    /** The folder, the module and the key other plugins take it by. */
    name: string;

    /** HostPlugin names whose api this one calls. Boot order follows. */
    needs?: readonly string[];

    /** Wiring: read config, offer an api, subscribe, claim a hook point. */
    boot: (host: Host) => void;

    /** Where work begins, in boot order. Optional. */
    start?: (host: Host) => void | Promise<void>;

    /** Unwinds it, in reverse. Optional. */
    stop?: (host: Host) => void | Promise<void>;
};
