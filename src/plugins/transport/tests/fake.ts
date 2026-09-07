import type { Socket } from "../api";

export function fakeSocket(): Socket & {
    opened: () => void;
    delivered: (text: string) => void;
    dropped: () => void;
    failed: () => void;
    sent: () => string[];
} {
    const listeners = new Map<string, ((event: unknown) => void)[]>();
    const outbox: string[] = [];

    let state = 0;

    const fire = (kind: string, event?: unknown): void =>
    {
        for (const run of listeners.get(kind) ?? [])
        {
            run(event);
        }
    };

    return {
        send: (data: string) =>
        {
            if (state !== 1)
            {
                throw new Error("socket is not open");
            }

            outbox.push(data);
        },

        close: () =>
        {
            if (state === 3)
            {
                return;
            }

            state = 3;
            fire("close");
        },

        addEventListener: (kind: string, run: (event: unknown) => void) =>
        {
            listeners.set(kind, [...(listeners.get(kind) ?? []), run]);
        },

        opened: () =>
        {
            state = 1;
            fire("open");
        },

        delivered: (text: string) =>
        {
            if (state !== 1)
            {
                return;
            }

            fire("message", { data: text });
        },

        dropped: () =>
        {
            state = 3;
            fire("close");
        },

        failed: () =>
        {
            fire("error");
        },

        sent: () => [...outbox],
    };
}

export type Answering = {
    status?: number;
    body?: unknown;
    json?: boolean;
    throws?: unknown;
};

export function fakeFetch(answers: Answering[]): {
    calls: () => { url: string; method: string; body: unknown }[];
    restore: () => void;
} {
    const calls: { url: string; method: string; body: unknown }[] = [];
    const real = globalThis.fetch;

    let at = 0;

    globalThis.fetch = (async (url: string | URL, init?: RequestInit) =>
    {
        calls.push({
            url: String(url),
            method: init?.method ?? "GET",
            body: init?.body === undefined ? undefined : JSON.parse(String(init.body)),
        });

        const answer = answers[Math.min(at, answers.length - 1)] ?? {};

        at += 1;

        if (answer.throws !== undefined)
        {
            throw answer.throws;
        }

        const status = answer.status ?? 200;

        return {
            ok: status >= 200 && status < 300,
            status,
            json: async () =>
            {
                if (answer.json === false)
                {
                    throw new Error("not json");
                }

                return answer.body;
            },
        };
    }) as typeof globalThis.fetch;

    return {
        calls: () => [...calls],
        restore: () =>
        {
            globalThis.fetch = real;
        },
    };
}
