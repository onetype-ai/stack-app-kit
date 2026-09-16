import type { HttpRequest, Channel, TransportOptions, Subscription, Transport } from "../api";
import type { Answer } from "./channel";
import { TransportFault } from "./faults";
import { http } from "./http";
import { methods } from "./method";
import { retry } from "./retry";
import { socket } from "./socket";

type HostLog = (line: string, about?: Readonly<Record<string, unknown>>) => void;

export function transport(settings: TransportOptions, log: HostLog): Transport
{
    const timeoutMs = settings.timeoutMs ?? 15_000;
    const retries = settings.retries ?? 2;
    const retryBaseMs = settings.retryBaseMs ?? 200;
    const rest = settings.sleep ?? ((ms: number) => new Promise<void>((done) => setTimeout(done, ms)));

    const overHttp = http({
        baseUrl: settings.baseUrl,
        timeoutMs,
        headers: settings.headers,
    });

    const socketChannel = settings.wsUrl !== undefined && settings.openSocket !== undefined
        ? socket({
            wsUrl: settings.wsUrl,
            timeoutMs,
            connectTimeoutMs: settings.connectTimeoutMs ?? 3_000,
            reconnectBaseMs: settings.reconnectBaseMs ?? 1_000,
            open: settings.openSocket,
            log,
        })
        : undefined;

    async function sendOnce(request: HttpRequest): Promise<Answer>
    {
        const channel = socketChannel !== undefined && socketChannel.channel.open() ? socketChannel.channel : overHttp;

        try
        {
            return await channel.send(request);
        }
        catch (cause)
        {
            const socketDropped = channel.name === "ws" && cause instanceof TransportFault && cause.retryable;

            if (socketDropped && methods.idempotent(request.method))
            {
                log("socket request failed; http is carrying it", { path: request.path });

                return overHttp.send(request);
            }

            throw cause;
        }
    }

    let connecting: Promise<Channel> | undefined;

    return {
        connect: async (): Promise<Channel> =>
        {
            if (socketChannel === undefined)
            {
                return "http";
            }

            if (socketChannel.channel.open())
            {
                return "ws";
            }

            connecting ??= socketChannel
                .connect()
                .then((connected): Channel => (connected ? "ws" : "http"))
                .finally(() =>
                {
                    connecting = undefined;
                });

            return connecting;
        },

        channel: (): Channel =>
        {
            return socketChannel !== undefined && socketChannel.channel.open() ? "ws" : "http";
        },

        request: async (request: HttpRequest): Promise<unknown> =>
        {
            let refusal: unknown;

            for (let attempt = 0; attempt <= retries; attempt += 1)
            {
                try
                {
                    return (await sendOnce(request)).body;
                }
                catch (cause)
                {
                    refusal = cause;

                    if (cause instanceof TransportFault && cause.code === "UNAUTHORIZED")
                    {
                        settings.onUnauthorized?.(request.path);

                        throw cause;
                    }

                    if (attempt === retries || !retry.should(cause, request.method))
                    {
                        throw cause;
                    }

                    const wait = retry.delayMs(attempt, retryBaseMs);

                    log("retrying", { path: request.path, attempt: attempt + 1, wait });

                    await rest(wait);
                }
            }

            throw refusal;
        },

        subscribe: (topic: string, receive: (message: unknown) => void): Subscription =>
        {
            if (socketChannel === undefined)
            {
                log("subscribe was called with no socket configured", { topic });

                return { close: () => {} };
            }

            return socketChannel.subscribe(topic, receive);
        },

        close: (): void =>
        {
            socketChannel?.close();
        },
    };
}
