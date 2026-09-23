import type { Host } from "../../kernel/host";
import type { HostPlugin } from "../../kernel/plugin";
import { NAME, negotiate } from "./api";

/** Offers the negotiation both kits share: one tag from what the viewer accepts. */
export function localePlugin(): HostPlugin
{
    return {
        name: NAME,
        needs: ["kernel"],

        boot: (host: Host) =>
        {
            host.offer(NAME, { negotiate });
        },
    };
}
