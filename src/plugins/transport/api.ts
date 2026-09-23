import type { Host } from "../../kernel/host";
import { address } from "./internal/address";
import { TransportFault } from "./internal/faults";
import type { TransportFaultCode } from "./internal/faults";
import type { HttpMethod } from "./internal/method";

/** What this plugin offers itself as. */
export const NAME = "transport";

/** One request. Everything a caller may say about what it wants. */
export type HttpRequest = {
    method: HttpMethod;
    path: string;
    query?: Readonly<Record<string, string | number | boolean | null | undefined>> | undefined;
    body?: unknown;
    headers?: Readonly<Record<string, string>> | undefined;
    signal?: AbortSignal | undefined;
};

/** One upload: a file sent as it is, or a form sent as multipart. Never retried, and never over the socket. */
export type UploadRequest = {
    path: string;
    body: Blob | FormData;
    method?: "POST" | "PUT" | undefined;
    query?: Readonly<Record<string, string | number | boolean | null | undefined>> | undefined;
    headers?: Readonly<Record<string, string>> | undefined;
    signal?: AbortSignal | undefined;

    /** Bytes sent so far, and the total (0 when the browser cannot tell). */
    onProgress?: ((sent: number, total: number) => void) | undefined;
};

/** How an upload leaves: `XMLHttpRequest` by default, since only it reports upload progress; a test or a server passes its own. */
export type Uploader = (upload: {
    url: string;
    method: "POST" | "PUT";
    headers: Readonly<Record<string, string>>;
    body: Blob | FormData;
    signal?: AbortSignal;
    onProgress?: (sent: number, total: number) => void;
}) => Promise<{ status: number; body: unknown }>;

/** Which channel is carrying requests now. */
export type Channel = "ws" | "http";

/** What a caller holds to stop receiving. */
export type Subscription = {
    close: () => void;
};

/** What the plugin needs before it can dial anything. */
export type TransportOptions = {
    baseUrl: string;

    /**
     * Where the socket dials. A function is read on every dial and redial with the headers a request would carry now
     * (`headers` and every plugin's), so the address can follow the viewer; answering undefined keeps the socket closed until `reconnect()`.
     */
    wsUrl?: string | ((sent: Readonly<Record<string, string>>) => string | undefined) | undefined;

    /** "requests" (the default) sends requests over the socket while it is open; "push" keeps every request on HTTP and the socket for pushes only. */
    socketFor?: "requests" | "push" | undefined;
    openSocket?: ((url: string) => Socket) | undefined;
    headers?: (() => Readonly<Record<string, string>>) | undefined;
    onUnauthorized?: ((path: string) => void) | undefined;
    timeoutMs?: number;
    retries?: number;
    retryBaseMs?: number;
    connectTimeoutMs?: number;
    reconnectBaseMs?: number;
    sleep?: ((ms: number) => Promise<void>) | undefined;

    /** Spreads every retry and redial between half and all of its backoff, so the tabs of a restarted server do not return in the same instant. */
    random?: (() => number) | undefined;

    /** How uploads leave; `XMLHttpRequest` when left out. */
    uploader?: Uploader | undefined;

    /** Once the server has sent `$ping`, a socket silent this long is closed and dialled again (60 s by default). A server that never pings is never timed. */
    silenceMs?: number | undefined;

    /** Hands a listener to whatever says the device is back (online, a tab shown again); the socket then redials at once rather than waiting its backoff. Answers a stop. */
    wake?: ((listener: () => void) => () => void) | undefined;

    /** Runs once a socket after the first is settled: the server said `$ready` and answered every subscription, or said nothing within `connectTimeoutMs`. Pushes sent while it was down are lost, so this is when to fetch again. */
    onReconnected?: ((about: { downMs: number }) => void) | undefined;
};

/** The socket shape this plugin drives. */
export type Socket = {
    send: (data: string) => void;
    close: () => void;
    addEventListener: (kind: string, run: (event: unknown) => void) => void;
};

/** The one HTTP boundary. */
export type Transport = {
    /** Tries the socket once and answers which channel is live. */
    connect: () => Promise<Channel>;

    /** Which channel is carrying now. */
    channel: () => Channel;

    /** One request. The body comes back as unknown, so the caller validates. */
    request: (request: HttpRequest) => Promise<unknown>;

    /** One upload, with progress; the body comes back as unknown. It carries the headers every request carries. */
    upload: (request: UploadRequest) => Promise<unknown>;

    /** Server-pushed messages. With no socket this succeeds and delivers nothing. `refused` hears the server decline the channel (unknown and forbidden read alike). */
    subscribe: (topic: string, receive: (message: unknown) => void, refused?: (code: string) => void) => Subscription;

    /** Closes the socket and dials again with the address as it reads now, keeping every subscription; a socket closed as signed out (4001) waits for this. */
    reconnect: () => void;

    /** Stops the socket for good. */
    close: () => void;
};

/** The transport, for a plugin that declared "transport" in needs. */
export function from(host: Host): Transport | undefined
{
    return host.take<Transport>(NAME);
}

export { address };
export { TransportFault };
export type { TransportFaultCode, HttpMethod };
