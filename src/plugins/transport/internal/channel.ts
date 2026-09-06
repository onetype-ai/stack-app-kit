import type { Request } from "../api";

/** What came back. */
export type Answer = {
    status: number;
    body: unknown;
    channel: "ws" | "http";
};

/** One way of carrying a request. HTTP always can; a socket only when open. */
export type Channel = {
    name: "ws" | "http";
    open: () => boolean;
    send: (request: Request) => Promise<Answer>;
};
