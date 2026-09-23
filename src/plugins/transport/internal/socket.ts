import type { HttpRequest, Socket, Subscription } from "../api";
import type { Answer, Wire } from "./channel";
import { TransportFault } from "./faults";
import { frame } from "./frame";
import type { Control } from "./frame";

type SocketOptions = {
    address: () => string | undefined;
    headers: () => Readonly<Record<string, string>>;
    random: () => number;
    timeoutMs: number;
    connectTimeoutMs: number;
    reconnectBaseMs: number;
    silenceMs: number;
    open: (url: string) => Socket;
    wake: ((listener: () => void) => () => void) | undefined;
    reconnected: (about: { downMs: number }) => void;
    log: (line: string, about?: Readonly<Record<string, unknown>>) => void;
    now?: (() => number) | undefined;
};

type InFlight = {
    method: string;
    path: string;
    resolve: (answer: Answer) => void;
    fail: (cause: Error) => void;
    timer: ReturnType<typeof setTimeout>;
};

const closedAsSignedOut = 4001;
const closedAsForbidden = 4003;
const closedAtLifetime = 4000;
const longestWaitMs = 30_000;

function closeCodeOf(event: unknown): number | undefined
{
    if (typeof event !== "object" || event === null || !("code" in event))
    {
        return undefined;
    }

    return typeof event.code === "number" ? event.code : undefined;
}

export function socket(settings: SocketOptions)
{
    const waiting = new Map<string, InFlight>();
    const subscribers = new Map<string, Set<(message: unknown) => void>>();
    const refusals = new Map<string, Set<(code: string) => void>>();
    const now = settings.now ?? Date.now;

    let current: Socket | undefined;
    let wire: Socket | undefined;
    let openedAt: number | undefined;
    let isOpen = false;
    let tries = 0;
    let closedByUs = false;
    let later: ReturnType<typeof setTimeout> | undefined;
    let counter = 0;
    let hasOpened = false;
    let waitsForReconnect = false;
    let serverAskedMs = 0;
    let droppedAt: number | undefined;
    let isHeartbeating = false;
    let silence: ReturnType<typeof setTimeout> | undefined;
    let readiness: { unanswered: Set<string>; isReady: boolean; announced: boolean; downMs: number; timer: ReturnType<typeof setTimeout> } | undefined;

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

        heard();

        if ("control" in read)
        {
            obeyed(read);

            return;
        }

        if ("subscribed" in read || "refused" in read)
        {
            if ("refused" in read)
            {
                for (const refused of refusals.get(read.channel) ?? [])
                {
                    refused(read.refused);
                }
            }

            readiness?.unanswered.delete(read.channel);
            announceWhenSettled();

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
                pending.fail(TransportFault.fromStatus(read.status, { method: pending.method, path: pending.path, body: read.body }));

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

    function obeyed(control: Control): void
    {
        if (control.control === "ping")
        {
            isHeartbeating = true;
            heard();

            return;
        }

        if (control.control === "backoff")
        {
            serverAskedMs = control.ms;

            return;
        }

        if (readiness !== undefined)
        {
            readiness.isReady = true;
            announceWhenSettled();
        }
    }

    function heard(): void
    {
        if (!isHeartbeating)
        {
            return;
        }

        clearTimeout(silence);
        silence = setTimeout(() =>
        {
            settings.log("transport heard nothing from the server in time; dialling again", { silenceMs: settings.silenceMs });
            current?.close();
        }, settings.silenceMs);
    }

    function announceWhenSettled(): void
    {
        if (readiness?.isReady === true && readiness.unanswered.size === 0)
        {
            announce();
        }
    }

    function announce(): void
    {
        if (readiness === undefined || readiness.announced)
        {
            return;
        }

        readiness.announced = true;
        clearTimeout(readiness.timer);
        settings.reconnected({ downMs: readiness.downMs });
    }

    function tell(what: "subscribe" | "unsubscribe", topic: string): void
    {
        if (isOpen && wire !== undefined)
        {
            wire.send(JSON.stringify({ [what]: topic }));
        }
    }

    function dropped(): void
    {
        isOpen = false;
        wire = undefined;
        openedAt = undefined;
        droppedAt ??= now();
        isHeartbeating = false;
        clearTimeout(silence);
        clearTimeout(readiness?.timer);
        readiness = undefined;

        failAll(new TransportFault("NETWORK", "The socket closed before the response arrived.", {
            method: "WS",
            path: "(in flight)",
            retryable: true,
        }));
    }

    function redialAfter(code: number | undefined, livedMs: number): void
    {
        if (closedByUs || later !== undefined)
        {
            return;
        }

        if (code === closedAsSignedOut || code === closedAsForbidden)
        {
            waitsForReconnect = true;
            settings.log("transport socket was refused by the server; it waits for reconnect()", { code });

            return;
        }

        const livedLong = livedMs >= settings.reconnectBaseMs;

        if (livedLong)
        {
            tries = 0;
        }

        tries += 1;

        const ceiling = Math.min(settings.reconnectBaseMs * 2 ** (tries - 1), longestWaitMs);
        const backedOff = code === closedAtLifetime && livedLong ? 0 : Math.round(ceiling / 2 + (settings.random() * ceiling) / 2);
        const wait = Math.max(backedOff, serverAskedMs);

        serverAskedMs = 0;

        settings.log("transport lost its socket; http carries requests while it retries", { tries, wait });

        later = setTimeout(() =>
        {
            later = undefined;
            void connect();
        }, wait);
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

            let url: string | undefined;

            try
            {
                url = settings.address();
            }
            catch (cause)
            {
                settings.log("transport could not work out a socket address; using http while it retries", { cause });
                resolveOnce(false);
                redialAfter(undefined, 0);

                return;
            }

            if (url === undefined)
            {
                settings.log("transport has no socket address for now; using http");
                resolveOnce(false);

                return;
            }

            let next: Socket;

            try
            {
                next = settings.open(url);
            }
            catch (cause)
            {
                settings.log("transport could not open a socket; using http while it retries", { cause });
                resolveOnce(false);
                redialAfter(undefined, 0);

                return;
            }

            current = next;

            const timer = setTimeout(() =>
            {
                settings.log("transport could not open a socket in time; using http");
                resolveOnce(false);

                if (current === next && !isOpen)
                {
                    next.close();
                }
            }, settings.connectTimeoutMs);

            next.addEventListener("open", () =>
            {
                clearTimeout(timer);

                if (current !== next || settled)
                {
                    next.close();

                    return;
                }

                wire = next;
                isOpen = true;
                openedAt = now();

                if (hasOpened)
                {
                    readiness = {
                        unanswered: new Set(subscribers.keys()),
                        isReady: false,
                        announced: false,
                        downMs: droppedAt === undefined ? 0 : now() - droppedAt,
                        timer: setTimeout(announce, settings.connectTimeoutMs),
                    };
                }

                hasOpened = true;
                droppedAt = undefined;

                for (const topic of subscribers.keys())
                {
                    tell("subscribe", topic);
                }

                settings.log("transport connected over websocket");
                resolveOnce(true);
            });

            next.addEventListener("message", (event: unknown) =>
            {
                if (current === next)
                {
                    received((event as { data?: unknown }).data);
                }
            });

            next.addEventListener("error", () =>
            {
                clearTimeout(timer);
                resolveOnce(false);
            });

            next.addEventListener("close", (event: unknown) =>
            {
                clearTimeout(timer);
                resolveOnce(false);

                if (current !== next)
                {
                    return;
                }

                current = undefined;

                const livedMs = wire === next && openedAt !== undefined ? now() - openedAt : 0;

                dropped();
                redialAfter(closeCodeOf(event), livedMs);
            });
        });
    }

    function reconnect(): void
    {
        if (closedByUs)
        {
            return;
        }

        if (later !== undefined)
        {
            clearTimeout(later);
            later = undefined;
        }

        tries = 0;
        waitsForReconnect = false;

        const previous = current;

        current = undefined;

        if (previous !== undefined)
        {
            dropped();
            previous.close();
        }

        void connect();
    }

    function woke(): void
    {
        if (closedByUs || isOpen || waitsForReconnect || current !== undefined)
        {
            return;
        }

        clearTimeout(later);
        tries = 0;
        later = setTimeout(() =>
        {
            later = undefined;
            void connect();
        }, Math.round(settings.random() * settings.reconnectBaseMs));
    }

    const stopWaking = settings.wake?.(woke);

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

            const id = `${now()}-${counter}`;

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

                waiting.set(id, { method: request.method, path: request.path, resolve, fail, timer });

                try
                {
                    live.send(JSON.stringify({
                        id,
                        method: request.method,
                        path: request.path,
                        query: request.query,
                        body: request.body,
                        headers: { ...settings.headers(), ...request.headers },
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

        reconnect,

        subscribe: (topic: string, receive: (message: unknown) => void, refused?: (code: string) => void): Subscription =>
        {
            const listeners = subscribers.get(topic) ?? new Set<(message: unknown) => void>();
            const refusing = refusals.get(topic) ?? new Set<(code: string) => void>();

            listeners.add(receive);
            subscribers.set(topic, listeners);

            if (refused !== undefined)
            {
                refusing.add(refused);
                refusals.set(topic, refusing);
            }

            if (listeners.size === 1)
            {
                tell("subscribe", topic);
            }

            return {
                close: () =>
                {
                    listeners.delete(receive);

                    if (refused !== undefined)
                    {
                        refusing.delete(refused);
                    }

                    if (listeners.size === 0)
                    {
                        subscribers.delete(topic);
                        refusals.delete(topic);
                        tell("unsubscribe", topic);
                    }
                },
            };
        },

        close: (): void =>
        {
            closedByUs = true;
            stopWaking?.();
            clearTimeout(silence);
            clearTimeout(readiness?.timer);

            if (later !== undefined)
            {
                clearTimeout(later);
                later = undefined;
            }

            failAll(new TransportFault("ABORTED", "The transport was closed.", {
                method: "WS",
                path: "(in flight)",
            }));

            const previous = current;

            current = undefined;
            wire = undefined;
            isOpen = false;
            previous?.close();
        },
    };
}
