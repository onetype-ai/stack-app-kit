import type { Host } from "../../kernel/host";
import type { HostPlugin } from "../../kernel/plugin";
import { NAME, create, shipper } from "./api";

/** Offers the leveled logger and the shipper that sends a browser's logs home. */
export function logsPlugin(): HostPlugin
{
    return {
        name: NAME,
        needs: ["kernel"],

        boot: (host: Host) =>
        {
            host.offer(NAME, { create, shipper });
        },
    };
}
