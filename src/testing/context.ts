import { transport } from "../index";

import type { Cache, HttpClient, Context, Logger, Realtime, CallOptions } from "../index";

/** One request a plugin made, as the fake recorded it. */
export type FakeRequest = {
    method: string;
    path: string;
    query?: Readonly<Record<string, unknown>> | undefined;
    body?: unknown;
    headers?: Readonly<Record<string, string>> | undefined;
};

/** One event a plugin announced. */
export type EmittedEvent = {
    event: string;
    payload: unknown;
};

/** One command a plugin ran through `ctx.commands`. */
export type RanCommand = {
    command: string;
    input: unknown;
};

/** A status a route answers with, and whatever came with it. */
export type FakeResponse = {
    status: number;
    body?: unknown;
};

/** What routes a fake answers, keyed `"GET /parts"`. */
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
    asked: readonly FakeRequest[];

    /** Every event announced. */
    announced: readonly EmittedEvent[];

    /** Every cache key dropped. */
    invalidated: readonly (readonly unknown[])[];

    /** Every command run. */
    commanded: readonly RanCommand[];

    /** Every line logged, by level. */
    logged: readonly { level: string; line: string }[];

    /** How many times the plugin said what a viewer may do had moved. */
    regranted: number;

    /** What `ctx.hooks.run` answers next. Set it to refuse. */
    refusal: string | undefined;

    /** Sends a message on a channel, as a server would. */
    push: (channel: string, message: unknown) => void;
};

const isAnswered = (answer: unknown): answer is FakeResponse =>
{
    return typeof answer === "object"
        && answer !== null
        && "status" in answer
        && typeof (answer as FakeResponse).status === "number";
};

/** A context that answers the way the real one does. */
export function fakeContext<Config = unknown, Services = unknown>(
    answers: Answers = {},
    faking: Faking<Config> = {},
): Fake<Config, Services>
{
    const asked: FakeRequest[] = [];
    const announced: EmittedEvent[] = [];
    const invalidated: (readonly unknown[])[] = [];
    const commanded: RanCommand[] = [];
    const logged: { level: string; line: string }[] = [];
    const listeners = new Map<string, Set<(message: unknown) => void>>();
    const watching = new Set<() => void>();

    const fake: Fake<Config, Services> = {
        asked,
        announced,
        invalidated,
        commanded,
        logged,
        regranted: 0,
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
        return (path: string, request: CallOptions = {}): Promise<unknown> =>
        {
            asked.push({
                method,
                path,
                ...(request.query !== undefined && { query: request.query }),
                ...(request.body !== undefined && { body: request.body }),
                ...(request.headers !== undefined && { headers: request.headers }),
            });

            const dialled = transport.address("", path, request.query);
            const asKey = `${method} ${dialled.startsWith("/") ? dialled : `/${dialled}`}`;
            const answer = answers[asKey];

            if (answer === undefined && !(asKey in answers))
            {
                return Promise.reject(new transport.TransportFault(
                    "NOT_FOUND",
                    `Nothing answers "${asKey}". A fake answers the address the transport dials, query and all: name that one, or drop the query.`,
                    { method, path: asKey.slice(method.length + 1), status: 404 },
                ));
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

    const http: HttpClient = {
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
            const receivers = listeners.get(channel) ?? new Set<(message: unknown) => void>();

            receivers.add(receive);
            listeners.set(channel, receivers);

            return { close: () => receivers.delete(receive) };
        },
    };

    const logAt = (level: string) =>
    {
        return (line: string): void =>
        {
            logged.push({ level, line });
        };
    };

    const log: Logger = {
        debug: logAt("debug"),
        info: logAt("info"),
        warn: logAt("warn"),
        error: logAt("error"),
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

            changed: () =>
            {
                fake.regranted += 1;

                for (const notify of watching)
                {
                    notify();
                }
            },

            watch: (notify: () => void) =>
            {
                watching.add(notify);

                return () =>
                {
                    watching.delete(notify);
                };
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
