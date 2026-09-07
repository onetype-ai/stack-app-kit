import type { Request } from "../api";

export type Answer = {
    status: number;
    body: unknown;
    channel: "ws" | "http";
};

export type Channel = {
    name: "ws" | "http";
    open: () => boolean;
    send: (request: Request) => Promise<Answer>;
};
