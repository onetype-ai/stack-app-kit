import type { Socket } from "../api";

/**
 * A socket a test drives.
 *
 * It fails where a real one fails: a send before open throws, a close after
 * close is a no-op, and nothing is delivered once it has closed. A fake that
 * accepted what a real one rejects is where bugs hide.
 */
export function fakeSocket(): Socket & {
    opened: () => void;
    delivered: (raw: string) => void;
    dropped: () => void;
    failed: () => void;
    sent: () => string[];
} {
    const listeners = new Map<string, ((event: unknown) => void)[]>();
    const written: string[] = [];

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

            written.push(data);
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

        delivered: (raw: string) =>
        {
            if (state !== 1)
            {
                return;
            }

            fire("message", { data: raw });
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

        sent: () => [...written],
    };
}

/** What one fetch answers with. */
export type Answering = {
    status?: number;
    body?: unknown;
    json?: boolean;
    throws?: unknown;
};

/**
 * Replaces fetch for one test, and records what it was asked.
 *
 * Returns what was called, so a test can assert that a request that must not
 * be re-sent was sent exactly once.
 */
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
