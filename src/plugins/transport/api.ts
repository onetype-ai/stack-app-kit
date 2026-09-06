import type { Host } from "../../kernel/host";
import { TransportFault } from "./internal/faults";
import type { FaultCode } from "./internal/faults";
import type { Method } from "./internal/method";

/** What this plugin offers itself as. */
export const NAME = "transport";

/** One request. Everything a caller may say about what it wants. */
export type Request = {
    method: Method;
    path: string;
    query?: Readonly<Record<string, string | number | boolean | null | undefined>> | undefined;
    body?: unknown;
    headers?: Readonly<Record<string, string>> | undefined;
    signal?: AbortSignal | undefined;
};

/** Which channel is carrying requests now. */
export type Channel = "ws" | "http";

/** What a caller holds to stop receiving. */
export type Subscription = {
    close: () => void;
};

/** What the plugin needs before it can dial anything. */
export type Settings = {
    baseUrl: string;
    wsUrl?: string | undefined;
    openSocket?: ((url: string) => Socket) | undefined;
    headers?: (() => Readonly<Record<string, string>>) | undefined;
    onUnauthorized?: ((path: string) => void) | undefined;
    timeout?: number;
    retries?: number;
    retryBase?: number;
    connectTimeout?: number;
    reconnectBase?: number;
    sleep?: ((ms: number) => Promise<void>) | undefined;
};

/**
 * The socket shape this plugin drives.
 *
 * A parameter rather than a call to WebSocket, so the plugin runs where there
 * is none and a test passes its own.
 */
export type Socket = {
    send: (data: string) => void;
    close: () => void;
    addEventListener: (kind: string, run: (event: unknown) => void) => void;
};

/** The one HTTP boundary. */
export type Transport = {
    /**
     * Tries the socket once and answers which channel is live.
     *
     * A no-op on repeat: a second call while one is in flight joins it, and a
     * call on a live socket answers without opening another. Two sockets
     * would each deliver, so every push would arrive twice.
     */
    connect: () => Promise<Channel>;

    /** Which channel is carrying now. */
    channel: () => Channel;

    /**
     * One request. The body comes back as unknown: this plugin does not own
     * the caller's shapes, so the caller validates.
     */
    request: (request: Request) => Promise<unknown>;

    /**
     * Server-pushed messages. With no socket this succeeds and delivers
     * nothing, so a caller needs no branch.
     */
    subscribe: (channel: string, told: (message: unknown) => void) => Subscription;

    /** Stops the socket for good. */
    close: () => void;
};

/** The transport, for a plugin that declared "transport" in needs. */
export function from(host: Host): Transport | undefined
{
    return host.take<Transport>(NAME);
}

export { TransportFault };
export type { FaultCode, Method };
