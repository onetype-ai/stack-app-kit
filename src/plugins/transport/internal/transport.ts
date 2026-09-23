import type { HttpRequest, Channel, TransportOptions, Subscription, Transport } from "../api";
import type { Answer } from "./channel";
import { TransportFault } from "./faults";
import { http } from "./http";
import { methods } from "./method";
import { retry } from "./retry";
import { socket } from "./socket";
import { sendUpload } from "./upload";

type HostLog = (line: string, about?: Readonly<Record<string, unknown>>) => void;

export function transport(settings: TransportOptions, log: HostLog): Transport
{
    const timeoutMs = settings.timeoutMs ?? 15_000;
    const retries = settings.retries ?? 2;
    const retryBaseMs = settings.retryBaseMs ?? 200;
    const rest = settings.sleep ?? ((ms: number) => new Promise<void>((done) => setTimeout(done, ms)));
    const random = settings.random ?? Math.random;
    const sent = (): Readonly<Record<string, string>> => settings.headers?.() ?? {};
    const wsUrl = settings.wsUrl;

    if (settings.socketFor !== undefined && settings.socketFor !== "requests" && settings.socketFor !== "push")
    {
        throw new TransportFault("CLIENT", `transport: socketFor "${String(settings.socketFor)}" is not one of "requests" or "push". Name one of those, or leave it out for "requests".`, {
            method: "WS",
            path: "(settings)",
        });
    }

    const requestsOverSocket = settings.socketFor !== "push";

    const overHttp = http({
        baseUrl: settings.baseUrl,
        timeoutMs,
        headers: settings.headers,
    });

    const socketChannel = wsUrl !== undefined && settings.openSocket !== undefined
        ? socket({
            address: typeof wsUrl === "function" ? () => wsUrl(sent()) : () => wsUrl,
            headers: sent,
            random,
            timeoutMs,
            connectTimeoutMs: settings.connectTimeoutMs ?? 3_000,
            reconnectBaseMs: settings.reconnectBaseMs ?? 1_000,
            silenceMs: settings.silenceMs ?? 60_000,
            wake: settings.wake,
            reconnected: (about) =>
            {
                settings.onReconnected?.(about);
            },
            open: settings.openSocket,
            log,
        })
        : undefined;

    async function sendOnce(request: HttpRequest): Promise<Answer>
    {
        // The socket's identity was fixed when it was dialled; a request naming its own would be answered as the socket's.
        const namesItsIdentity = Object.keys(request.headers ?? {}).some((name) => ["authorization", "cookie"].includes(name.toLowerCase()));
        const channel = requestsOverSocket && !namesItsIdentity && socketChannel !== undefined && socketChannel.channel.open() ? socketChannel.channel : overHttp;

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

                    const wait = retry.delayMs(attempt, retryBaseMs, random);

                    log("retrying", { path: request.path, attempt: attempt + 1, wait });

                    await rest(wait);
                }
            }

            throw refusal;
        },

        upload: (request) =>
        {
            return sendUpload({ baseUrl: settings.baseUrl, headers: sent, uploader: settings.uploader, onUnauthorized: settings.onUnauthorized }, request);
        },

        subscribe: (topic: string, receive: (message: unknown) => void, refused?: (code: string) => void): Subscription =>
        {
            if (socketChannel === undefined)
            {
                log("subscribe was called with no socket configured", { topic });

                return { close: () => {} };
            }

            return socketChannel.subscribe(topic, receive, refused);
        },

        reconnect: (): void =>
        {
            socketChannel?.reconnect();
        },

        close: (): void =>
        {
            socketChannel?.close();
        },
    };
}
