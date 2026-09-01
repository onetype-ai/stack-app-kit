import type { Host } from "../../kernel/host";
import type { Plugin } from "../../kernel/plugin";
import { NAME, type Runtime } from "./api";
import { definePlugin } from "./internal/define";
import { createKernel } from "./internal/kernel";

/**
 * The kernel plugin: what lets an application declare plugins of its own.
 *
 * It holds no state and starts nothing. An application builds its own kernel
 * from what this offers, and two of them never see each other.
 */
export function plugin(): Plugin
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
