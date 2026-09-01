import type { Request, Carrying, Settings, Subscription, Transport } from "../api";
import type { Answered } from "./channel";
import { TransportFault } from "./faults";
import { http } from "./http";
import { methods } from "./method";
import { retry } from "./retry";
import { socket } from "./socket";

type Said = (line: string, about?: Readonly<Record<string, unknown>>) => void;

/** Builds the one HTTP boundary, over whichever channels the settings allow. */
export function transport(settings: Settings, say: Said): Transport
{
    const timeout = settings.timeout ?? 15_000;
    const retries = settings.retries ?? 2;
    const retryBase = settings.retryBase ?? 200;
    const rest = settings.sleep ?? ((ms: number) => new Promise<void>((done) => setTimeout(done, ms)));

    const over = http({
        baseUrl: settings.baseUrl,
        timeout,
        headers: settings.headers,
    });

    const live = settings.wsUrl !== undefined && settings.openSocket !== undefined
        ? socket({
            wsUrl: settings.wsUrl,
            timeout,
            connectTimeout: settings.connectTimeout ?? 3_000,
            reconnectBase: settings.reconnectBase ?? 1_000,
            open: settings.openSocket,
            say,
        })
        : undefined;

    /** One attempt, on whichever channel is live. */
    async function once(request: Request): Promise<Answered>
    {
        const channel = live !== undefined && live.channel.open() ? live.channel : over;

        try
        {
            return await channel.send(request);
        }
        catch (cause)
        {
            const dropped = channel.name === "ws" && cause instanceof TransportFault && cause.retryable;

            // Only an idempotent request may move channels. The socket may
            // have delivered a POST before it dropped, and sending it again
            // over http would apply it twice.
            if (dropped && methods.idempotent(request.method))
            {
                say("socket request failed; http is carrying it", { path: request.path });

                return over.send(request);
            }

            throw cause;
        }
    }

    let connecting: Promise<Carrying> | undefined;

    return {
        connect: async (): Promise<Carrying> =>
        {
            if (live === undefined)
            {
                return "http";
            }

            if (live.channel.open())
            {
                return "ws";
            }

            // A second call joins the one in flight. Opening another socket
            // would leave the first delivering, so every push would arrive
            // twice and close would only close one of them.
            connecting ??= live
                .connect()
                .then((opened): Carrying => (opened ? "ws" : "http"))
                .finally(() =>
                {
                    connecting = undefined;
                });

            return connecting;
        },

        carrying: (): Carrying =>
        {
            return live !== undefined && live.channel.open() ? "ws" : "http";
        },

        request: async (request: Request): Promise<unknown> =>
        {
            let last: unknown;

            for (let attempt = 0; attempt <= retries; attempt += 1)
            {
                try
                {
                    return (await once(request)).body;
                }
                catch (cause)
                {
                    last = cause;

                    if (cause instanceof TransportFault && cause.code === "UNAUTHORIZED")
                    {
                        settings.onUnauthorized?.(request.path);

                        throw cause;
                    }

                    if (attempt === retries || !retry.worth(cause, request.method))
                    {
                        throw cause;
                    }

                    const wait = retry.delay(attempt, retryBase);

                    say("retrying", { path: request.path, attempt: attempt + 1, wait });

                    await rest(wait);
                }
            }

            throw last;
        },

        subscribe: (channel: string, told: (message: unknown) => void): Subscription =>
        {
            if (live === undefined)
            {
                say("subscribe was called with no socket configured", { channel });

                return { close: () => {} };
            }

            return live.subscribe(channel, told);
        },

        close: (): void =>
        {
            live?.close();
        },
    };
}
