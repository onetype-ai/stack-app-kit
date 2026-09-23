import type { Host } from "../../kernel/host";
import type { HostPlugin } from "../../kernel/plugin";
import { NAME } from "./api";

/** Names the entry that renders pages in Node: prerender at build time, and per request. */
export function serverPlugin(): HostPlugin
{
    return {
        name: NAME,
        needs: ["kernel", "mount", "router", "seo"],

        boot: (host: Host) =>
        {
            host.offer(NAME, { entry: "@onetype/stack-app-kit/server" });
        },
    };
}
