import type { HttpRequest, Socket, Subscription } from "../api";
import type { Answer, Wire } from "./channel";
import { TransportFault } from "./faults";
import { frame } from "./frame";

type SocketOptions = {
    wsUrl: string;
    timeoutMs: number;
    connectTimeoutMs: number;
    reconnectBaseMs: number;
    open: (url: string) => Socket;
    log: (line: string, about?: Readonly<Record<string, unknown>>) => void;
    now?: (() => number) | undefined;
};

type InFlight = {
    resolve: (answer: Answer) => void;
    fail: (cause: Error) => void;
    timer: ReturnType<typeof setTimeout>;
};

export function socket(settings: SocketOptions)
{
    const waiting = new Map<string, InFlight>();
    const subscribers = new Map<string, Set<(message: unknown) => void>>();

    let wire: Socket | undefined;
    let isOpen = false;
    let tries = 0;
    let closedByUs = false;
    let later: ReturnType<typeof setTimeout> | undefined;
    let counter = 0;

    function failAll(cause: TransportFault): void
    {
        for (const [, pending] of waiting)
        {
            clearTimeout(pending.timer);
            pending.fail(cause);
        }

        waiting.clear();
    }

    function received(data: unknown): void
    {
        const read = frame(data);

        if (read === undefined)
        {
            settings.log("transport received a frame it could not read");

            return;
        }

        if ("id" in read)
        {
            const pending = waiting.get(read.id);

            if (pending === undefined)
            {
                return;
            }

            waiting.delete(read.id);
            clearTimeout(pending.timer);

            if (read.status >= 400)
            {
                pending.fail(TransportFault.fromStatus(read.status, { method: "WS", path: read.id }));

                return;
            }

            pending.resolve({ status: read.status, body: read.body, channel: "ws" });

            return;
        }

        for (const receive of subscribers.get(read.channel) ?? [])
        {
            receive(read.message);
        }
    }

    function tell(what: "subscribe" | "unsubscribe", topic: string): void
    {
        if (isOpen && wire !== undefined)
        {
            wire.send(JSON.stringify({ [what]: topic }));
        }
    }

    function connect(): Promise<boolean>
    {
        return new Promise<boolean>((resolve) =>
        {
            let settled = false;

            const resolveOnce = (value: boolean): void =>
            {
                if (!settled)
                {
                    settled = true;
                    resolve(value);
                }
            };

            const timer = setTimeout(() =>
            {
                settings.log("transport could not open a socket in time; using http");
                resolveOnce(false);
            }, settings.connectTimeoutMs);

            let next: Socket;

            try
            {
                next = settings.open(settings.wsUrl);
            }
            catch (cause)
            {
                clearTimeout(timer);
                settings.log("transport could not open a socket; using http", { cause });
                resolveOnce(false);

                return;
            }

            next.addEventListener("open", () =>
            {
                clearTimeout(timer);
                wire = next;
                isOpen = true;
                tries = 0;
                for (const topic of subscribers.keys())
                {
                    tell("subscribe", topic);
                }

                settings.log("transport connected over websocket");
                resolveOnce(true);
            });

            next.addEventListener("message", (event: unknown) =>
            {
                received((event as { data?: unknown }).data);
            });

            next.addEventListener("error", () =>
            {
                clearTimeout(timer);
                resolveOnce(false);
            });

            next.addEventListener("close", () =>
            {
                clearTimeout(timer);
                isOpen = false;
                wire = undefined;

                failAll(new TransportFault("NETWORK", "The socket closed before the response arrived.", {
                    method: "WS",
                    path: "(in flight)",
                    retryable: true,
                }));

                resolveOnce(false);

                if (closedByUs)
                {
                    return;
                }

                tries += 1;

                const wait = Math.min(settings.reconnectBaseMs * 2 ** (tries - 1), 30_000);

                settings.log("transport lost its socket; http carries requests while it retries", { tries, wait });

                later = setTimeout(() => void connect(), wait);
            });
        });
    }

    const channel: Wire = {
        name: "ws",

        open: () =>
        {
            return isOpen;
        },

        send: async (request: HttpRequest): Promise<Answer> =>
        {
            const live = wire;

            if (!isOpen || live === undefined)
            {
                throw new TransportFault("NETWORK", "No socket is open.", {
                    method: request.method,
                    path: request.path,
                    retryable: true,
                });
            }

            counter += 1;

            const id = `${settings.now?.() ?? Date.now()}-${counter}`;

            return new Promise<Answer>((resolve, fail) =>
            {
                const timer = setTimeout(() =>
                {
                    waiting.delete(id);
                    fail(new TransportFault("TIMEOUT", `The request did not complete within ${settings.timeoutMs}ms.`, {
                        method: request.method,
                        path: request.path,
                        retryable: true,
                    }));
                }, settings.timeoutMs);

                waiting.set(id, { resolve, fail, timer });

                try
                {
                    live.send(JSON.stringify({
                        id,
                        method: request.method,
                        path: request.path,
                        query: request.query,
                        body: request.body,
                        headers: request.headers,
                    }));
                }
                catch (cause)
                {
                    waiting.delete(id);
                    clearTimeout(timer);
                    fail(new TransportFault("NETWORK", "The request could not be written to the socket.", {
                        method: request.method,
                        path: request.path,
                        retryable: true,
                        cause,
                    }));
                }
            });
        },
    };

    return {
        channel,

        connect,

        subscribe: (topic: string, receive: (message: unknown) => void): Subscription =>
        {
            const listeners = subscribers.get(topic) ?? new Set<(message: unknown) => void>();

            listeners.add(receive);
            subscribers.set(topic, listeners);

            if (listeners.size === 1)
            {
                tell("subscribe", topic);
            }

            return {
                close: () =>
                {
                    listeners.delete(receive);

                    if (listeners.size === 0)
                    {
                        subscribers.delete(topic);
                        tell("unsubscribe", topic);
                    }
                },
            };
        },

        close: (): void =>
        {
            closedByUs = true;

            if (later !== undefined)
            {
                clearTimeout(later);
            }

            failAll(new TransportFault("ABORTED", "The transport was closed.", {
                method: "WS",
                path: "(in flight)",
            }));

            wire?.close();
            wire = undefined;
            isOpen = false;
        },
    };
}
