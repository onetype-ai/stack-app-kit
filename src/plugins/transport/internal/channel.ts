import type { HttpRequest } from "../api";

export type Answer = {
    status: number;
    body: unknown;
    channel: "ws" | "http";
};

export type Wire = {
    name: "ws" | "http";
    open: () => boolean;
    send: (request: HttpRequest) => Promise<Answer>;
};
