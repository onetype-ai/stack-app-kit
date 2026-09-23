import type { Host } from "../../kernel/host";
import type { HostPlugin } from "../../kernel/plugin";
import { NAME, configFor, problemsOf } from "./api";

/** Offers what maps the environment onto plugin config, and what refuses a public secret. */
export function settingsPlugin(): HostPlugin
{
    return {
        name: NAME,
        needs: ["kernel"],

        boot: (host: Host) =>
        {
            host.offer(NAME, { configFor, problemsOf });
        },
    };
}
