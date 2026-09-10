import type { Host } from "../../kernel/host";
import type { HostPlugin } from "../../kernel/plugin";
import { NAME } from "./api";
import { discover } from "./internal/discover";
import { start } from "./internal/start";

/** Brings an application up in one call. */
export function mountPlugin(): HostPlugin
{
    return {
        name: NAME,
        needs: ["kernel", "transport"],

        boot: (host: Host) =>
        {
            host.offer(NAME, { start, discover });
        },
    };
}
