import type { Request } from "../api";

/** What came back. */
export type Answered = {
    status: number;
    body: unknown;
    carried: "ws" | "http";
};

/** One way of carrying a request. HTTP always can; a socket only when open. */
export type Channel = {
    name: "ws" | "http";
    open: () => boolean;
    send: (request: Request) => Promise<Answered>;
};
