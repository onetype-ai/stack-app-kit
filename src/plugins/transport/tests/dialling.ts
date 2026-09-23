import { boot } from "../../../kernel/boot";
import { from } from "../api";
import type { Transport, TransportOptions } from "../api";
import { transportPlugin } from "../plugin";
import { fakeFetch, fakeSocket, type Answering } from "./fake";

export type Dialled = ReturnType<typeof fakeSocket> & { url: string };

const quiet = (): void => {};

export function dialling(settings: Partial<TransportOptions> = {}, answers: Answering[] = [{ body: {} }])
{
    const fetches = fakeFetch(answers);

    let workspace: string | undefined = "a";
    let isStopped = false;
    const dialled: Dialled[] = [];
    const app = boot(quiet, [
        transportPlugin({
            baseUrl: "https://example.test/api",
            headers: (): Record<string, string> => (workspace === undefined ? {} : { "x-workspace": workspace }),
            wsUrl: (sent) => (sent["x-workspace"] === undefined ? undefined : `wss://example.test/ws?workspace=${sent["x-workspace"]}`),
            openSocket: (url) =>
            {
                const socket = Object.assign(fakeSocket(), { url });

                dialled.push(socket);

                return socket;
            },
            connectTimeoutMs: 1_000,
            reconnectBaseMs: 1_000,
            random: () => 0,
            sleep: async () => {},
            ...settings,
        }),
    ]);

    const transport = from(app.host) as Transport;

    const last = (): Dialled =>
    {
        const socket = dialled.at(-1);

        if (socket === undefined)
        {
            throw new Error("No socket was dialled.");
        }

        return socket;
    };

    const connected = async (): Promise<Dialled> =>
    {
        const connecting = transport.connect();

        last().opened();
        await connecting;

        return last();
    };

    return {
        transport,
        fetches,
        dialled,
        last,
        connected,

        choose: (chosen: string | undefined): void =>
        {
            workspace = chosen;
        },

        stop: async (): Promise<void> =>
        {
            if (isStopped)
            {
                return;
            }

            isStopped = true;
            await app.stop();
            fetches.restore();
        },
    };
}
