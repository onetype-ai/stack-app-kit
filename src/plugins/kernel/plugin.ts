import type { Host } from "../../kernel/host";
import type { HostPlugin } from "../../kernel/plugin";
import { NAME, type Runtime } from "./api";
import { definePlugin } from "./internal/define";
import { createKernel } from "./internal/kernel";

/** The kernel plugin: what lets an application declare plugins of its own. */
export function kernelPlugin(): HostPlugin
{
    return {
        name: NAME,

        boot: (host: Host) =>
        {
            const runtime: Runtime = { create: createKernel, define: definePlugin };

            host.offer(NAME, runtime);
        },
    };
}
