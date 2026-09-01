import type { Host } from "../../kernel/host";
import type { Plugin } from "../../kernel/plugin";
import { NAME } from "./api";
import { discover } from "./internal/discover";
import { start } from "./internal/start";

/**
 * Brings an application up in one call.
 *
 * Everything here was boilerplate every application wrote for itself: build a
 * client, connect, hold early rejections, build the kernel, start it. None of
 * it differs between applications, so none of it belongs in one.
 */
export function plugin(): Plugin
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
