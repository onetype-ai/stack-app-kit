import type { Host } from "../../kernel/host";
import type { Plugin } from "../../kernel/plugin";
import { NAME, type Settings } from "./api";
import { transport } from "./internal/transport";

/**
 * The transport plugin.
 *
 * Settings are a parameter rather than something read from a global, so two
 * transports can exist in one process without seeing each other: that is what
 * a test needs, and a second mount of the application.
 */
export function plugin(settings: Settings): Plugin
{
    return {
        name: NAME,

        boot: (host: Host) =>
        {
            // Built here and offered, never dialled: boot is wiring. The
            // socket opens in start, once every plugin has wired.
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

            const carrying = await live.connect();

            host.say("transport ready", { carrying });
        },

        stop: (host: Host) =>
        {
            host.take<ReturnType<typeof transport>>(NAME)?.close();
        },
    };
}
