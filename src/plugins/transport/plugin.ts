import type { Host } from "../../kernel/host";
import type { HostPlugin } from "../../kernel/plugin";
import { NAME, type TransportOptions } from "./api";
import { transport } from "./internal/transport";

/** The transport plugin. */
export function transportPlugin(settings: TransportOptions): HostPlugin
{
    return {
        name: NAME,

        boot: (host: Host) =>
        {
            host.offer(NAME, transport(settings, (line, about) =>
            {
                host.say(line, about);
            }));
        },

        start: async (host: Host) =>
        {
            const live = host.take<ReturnType<typeof transport>>(NAME);

            if (live === undefined)
            {
                return;
            }

            const channel = await live.connect();

            host.say("transport ready", { channel });
        },

        stop: (host: Host) =>
        {
            host.take<ReturnType<typeof transport>>(NAME)?.close();
        },
    };
}
