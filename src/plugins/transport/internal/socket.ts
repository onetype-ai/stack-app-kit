import type { Request, Socket, Subscription } from "../api";
import type { Answer, Channel } from "./channel";
import { TransportFault } from "./faults";
import { frame } from "./frame";

type Settings = {
    wsUrl: string;
    timeout: number;
    connectTimeout: number;
    reconnectBase: number;
    open: (url: string) => Socket;
    say: (line: string, about?: Readonly<Record<string, unknown>>) => void;
    now?: (() => number) | undefined;
};

type Waiting = {
    keep: (answered: Answer) => void;
    fail: (cause: Error) => void;
    timer: ReturnType<typeof setTimeout>;
};

/** The socket channel, and the reconnect loop behind it. */
export function socket(settings: Settings)
{
    const waiting = new Map<string, Waiting>();
    const subscribers = new Map<string, Set<(message: unknown) => void>>();

    let wire: Socket | undefined;
    let open = false;
    let tries = 0;
    let ours = false;
    let later: ReturnType<typeof setTimeout> | undefined;
    let counter = 0;

    /**
     * Fails everything in flight.
     *
     * A request whose socket went away must fail rather than hang: a caller
     * waiting forever is worse than one told the connection dropped.
     */
    function failAll(cause: TransportFault): void
    {
        for (const [, one] of waiting)
        {
            clearTimeout(one.timer);
            one.fail(cause);
        }

        waiting.clear();
    }

    function received(data: unknown): void
    {
        const read = frame(data);

        if (read === undefined)
        {
            settings.say("transport received a frame it could not read");

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

            pending.keep({ status: read.status, body: read.body, channel: "ws" });

            return;
        }

        for (const told of subscribers.get(read.channel) ?? [])
        {
            told(read.message);
        }
    }

    function connect(): Promise<boolean>
    {
        return new Promise<boolean>((resolve) =>
        {
            let settled = false;

            const settle = (value: boolean): void =>
            {
                if (!settled)
                {
                    settled = true;
                    resolve(value);
                }
            };

            const timer = setTimeout(() =>
            {
                settings.say("transport could not open a socket in time; using http");
                settle(false);
            }, settings.connectTimeout);

            let next: Socket;

            try
            {
                next = settings.open(settings.wsUrl);
            }
            catch (cause)
            {
                clearTimeout(timer);
                settings.say("transport could not open a socket; using http", { cause });
                settle(false);

                return;
            }

            next.addEventListener("open", () =>
            {
                clearTimeout(timer);
                wire = next;
                open = true;
                tries = 0;
                settings.say("transport connected over websocket");
                settle(true);
            });

            next.addEventListener("message", (event: unknown) =>
            {
                received((event as { data?: unknown }).data);
            });

            next.addEventListener("error", () =>
            {
                clearTimeout(timer);
                settle(false);
            });

            next.addEventListener("close", () =>
            {
                clearTimeout(timer);
                open = false;
                wire = undefined;

                failAll(new TransportFault("NETWORK", "The socket closed before the response arrived.", {
                    method: "WS",
                    path: "(in flight)",
                    retryable: true,
                }));

                settle(false);

                if (ours)
                {
                    return;
                }

                tries += 1;

                const wait = Math.min(settings.reconnectBase * 2 ** (tries - 1), 30_000);

                settings.say("transport lost its socket; http carries requests while it retries", { tries, wait });

                later = setTimeout(() => void connect(), wait);
            });
        });
    }

    const channel: Channel = {
        name: "ws",

        open: () =>
        {
            return open;
        },

        send: async (request: Request): Promise<Answer> =>
        {
            const live = wire;

            if (!open || live === undefined)
            {
                throw new TransportFault("NETWORK", "No socket is open.", {
                    method: request.method,
                    path: request.path,
                    retryable: true,
                });
            }

            counter += 1;

            const id = `${settings.now?.() ?? Date.now()}-${counter}`;

            return new Promise<Answer>((keep, fail) =>
            {
                const timer = setTimeout(() =>
                {
                    waiting.delete(id);
                    fail(new TransportFault("TIMEOUT", `The request did not complete within ${settings.timeout}ms.`, {
                        method: request.method,
                        path: request.path,
                        retryable: true,
                    }));
                }, settings.timeout);

                waiting.set(id, { keep, fail, timer });

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

        subscribe: (channel: string, told: (message: unknown) => void): Subscription =>
        {
            const listeners = subscribers.get(channel) ?? new Set<(message: unknown) => void>();

            listeners.add(told);
            subscribers.set(channel, listeners);

            return {
                close: () =>
                {
                    listeners.delete(told);

                    if (listeners.size === 0)
                    {
                        subscribers.delete(channel);
                    }
                },
            };
        },

        close: (): void =>
        {
            ours = true;

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
            open = false;
        },
    };
}
