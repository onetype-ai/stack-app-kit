import type { Host } from "../../kernel/host";
import type { HostPlugin } from "../../kernel/plugin";
import { NAME } from "./api";

/** Names the entry that starts services and watched browsers for end-to-end tests. */
export function e2ePlugin(): HostPlugin
{
    return {
        name: NAME,

        boot: (host: Host) =>
        {
            host.offer(NAME, { entry: "@onetype/stack-app-kit/e2e" });
        },
    };
}
