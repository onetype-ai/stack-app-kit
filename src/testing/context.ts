import { transport } from "../index";

import type { Cache, Client, Context, Logger, Realtime, Request } from "../index";

/** One request a plugin made, as the fake recorded it. */
export type Asked = {
    method: string;
    path: string;
    query?: Readonly<Record<string, unknown>> | undefined;
    body?: unknown;
    headers?: Readonly<Record<string, string>> | undefined;
};

/** One event a plugin announced. */
export type Announced = {
    event: string;
    payload: unknown;
};

/** One command a plugin ran through `ctx.commands`. */
export type Commanded = {
    command: string;
    input: unknown;
};

/** A status a route answers with, and whatever came with it. */
export type Answered = {
    status: number;
    body?: unknown;
};

/**
 * What routes a fake answers, keyed `"GET /parts"`.
 *
 * A bare value is a 200 carrying it, which is most of them. An `Answered`
 * says the status too: 204 for nothing, a 4xx for a refusal a caller reads
 * its fields off. Deliberately `unknown` rather than a union: every union
 * with `unknown` in it is `unknown`, and one written otherwise would only
 * look like it checked something.
 */
export type Answers = Readonly<Record<string, unknown>>;

/** What a fake was given, beyond its answers. */
export type Faking<Config> = {
    name?: string;
    config?: Config;
    services?: unknown;

    /** What `ctx.permissions` answers. Everything, unless a list is given. */
    permissions?: readonly string[];

    /** What `ctx.hooks.run` answers: a reason refuses, nothing allows. */
    refusal?: string | undefined;

    /** What each named plugin's `ctx.use` hands back. */
    offering?: Readonly<Record<string, unknown>>;
};

/** A fake context, and everything that reached it. */
export type Fake<Config = unknown, Services = unknown> = {
    ctx: Context<Config, Services>;

    /** Every request, in order. */
    asked: readonly Asked[];

    /** Every event announced. */
    announced: readonly Announced[];

    /** Every cache key dropped. */
    invalidated: readonly (readonly unknown[])[];

    /** Every command run. */
    commanded: readonly Commanded[];

    /** Every line logged, by level. */
    logged: readonly { level: string; line: string }[];

    /** What `ctx.hooks.run` answers next. Set it to refuse. */
    refusal: string | undefined;

    /**
     * Sends a message on a channel, as a server would.
     *
     * Nothing here opens a socket, so a plugin listening for a push would
     * otherwise be testable only by asserting it did not throw.
     */
    push: (channel: string, message: unknown) => void;
};

const isAnswered = (answer: unknown): answer is Answered =>
{
    return typeof answer === "object"
        && answer !== null
        && "status" in answer
        && typeof (answer as Answered).status === "number";
};

/**
 * A context that answers the way the real one does.
 *
 * Every plugin used to write its own, and the shapes drifted: one answered an
 * envelope `ctx.http` never hands back, another resolved `undefined` where the
 * transport refuses. A fake that agrees with a wrong belief tests the belief,
 * and on one project two hundred tests stayed green over thirty-nine broken
 * calls for exactly that reason.
 *
 * So this answers the body, refuses an unanswered path, and throws the same
 * `TransportFault` a server's 4xx throws, carrying `status` and `body`.
 */
export function fakeContext<Config = unknown, Services = unknown>(
    answers: Answers = {},
    faking: Faking<Config> = {},
): Fake<Config, Services>
{
    const asked: Asked[] = [];
    const announced: Announced[] = [];
    const invalidated: (readonly unknown[])[] = [];
    const commanded: Commanded[] = [];
    const logged: { level: string; line: string }[] = [];
    const listeners = new Map<string, Set<(message: unknown) => void>>();

    const fake: Fake<Config, Services> = {
        asked,
        announced,
        invalidated,
        commanded,
        logged,
        refusal: faking.refusal,

        push: (channel: string, message: unknown): void =>
        {
            for (const receive of listeners.get(channel) ?? [])
            {
                receive(message);
            }
        },

        ctx: undefined as unknown as Context<Config, Services>,
    };

    const send = (method: string) =>
    {
        return (path: string, request: Request = {}): Promise<unknown> =>
        {
            asked.push({
                method,
                path,
                ...(request.query !== undefined && { query: request.query }),
                ...(request.body !== undefined && { body: request.body }),
                ...(request.headers !== undefined && { headers: request.headers }),
            });

            const answer = answers[`${method} ${path}`];

            if (answer === undefined && !(`${method} ${path}` in answers))
            {
                return Promise.reject(transport.TransportFault.fromStatus(404, { method, path }));
            }

            if (isAnswered(answer))
            {
                if (answer.status >= 400)
                {
                    return Promise.reject(transport.TransportFault.fromStatus(answer.status, {
                        method,
                        path,
                        body: answer.body,
                    }));
                }

                return Promise.resolve(answer.status === 204 ? undefined : answer.body);
            }

            return Promise.resolve(answer);
        };
    };

    const http: Client = {
        get: send("GET"),
        post: send("POST"),
        put: send("PUT"),
        patch: send("PATCH"),
        delete: send("DELETE"),
    };

    const cache: Cache = {
        invalidate: (key) =>
        {
            invalidated.push([...key]);
        },
    };

    const realtime: Realtime = {
        channel: () => "http",

        subscribe: (channel, receive) =>
        {
            const heard = listeners.get(channel) ?? new Set<(message: unknown) => void>();

            heard.add(receive);
            listeners.set(channel, heard);

            return { close: () => heard.delete(receive) };
        },
    };

    const at = (level: string) =>
    {
        return (line: string): void =>
        {
            logged.push({ level, line });
        };
    };

    const log: Logger = {
        debug: at("debug"),
        info: at("info"),
        warn: at("warn"),
        error: at("error"),
    };

    fake.ctx = {
        name: faking.name ?? "fake",
        config: (faking.config ?? {}) as Config,
        services: (faking.services ?? {}) as Services,

        log,
        http,
        cache,
        realtime,

        events: {
            emit: (event, payload) =>
            {
                announced.push({ event, payload });
            },
            on: () => () => {},
        },

        hooks: {
            run: () => Promise.resolve(fake.refusal),
        },

        permissions: {
            has: (permission) =>
            {
                return faking.permissions === undefined || faking.permissions.includes(permission);
            },
            all: (permissions) =>
            {
                return faking.permissions === undefined
                    || permissions.every((one) => faking.permissions?.includes(one));
            },
        },

        commands: {
            run: (command, input) =>
            {
                commanded.push({ command, input });

                return Promise.resolve();
            },
        },

        use: <Api,>(plugin: string): Api =>
        {
            const offered = faking.offering?.[plugin];

            if (offered === undefined)
            {
                throw new Error(`This fake was not given services for "${plugin}". Pass them as \`offering\`.`);
            }

            return offered as Api;
        },
    };

    return fake;
}
