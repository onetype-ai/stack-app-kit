import type { ComponentType, FunctionComponent } from "react";
import type { z } from "zod";

/** Anything declared carries a sentence saying what it is for. */
export type Describable = {
    describe: string;
};

/** A declaration whose payload is checked before it reaches anyone. */
export type DescribableWithSchema = Describable & {
    schema: z.ZodType;
};

/** What a plugin may do, named so an application can grant it. */
export type Permission = {
    describe: string;
};

/** An event a plugin publishes. */
export type Event = {
    describe: string;
    schema: z.ZodType;
};

/**
 * What a listener does when an event arrives.
 *
 * `payload` is `unknown`, never `never`: a handler typed `(payload: never)`
 * accepts any annotation its author writes, because of contravariance, so the
 * compiler endorses a claim about a completely different schema. `unknown`
 * forces the parse that should happen anyway.
 */
export type Listener<Context> = Describable & {
    handle: (payload: unknown, ctx: Context) => void | Promise<void>;
};

/** A point where a plugin may refuse what is about to happen. */
export type Hook = {
    describe: string;
    schema: z.ZodType;
};

/** What a participant answers: nothing to allow, a reason to refuse. */
export type Participant<Context> = Describable & {
    handle: (payload: unknown, ctx: Context) => string | undefined | Promise<string | undefined>;
};

/** Something a plugin can be asked to do, behind the permissions it names. */
export type Command<Context> = DescribableWithSchema & {
    requires?: readonly string[] | undefined;
    run: (input: unknown, ctx: Context) => void | Promise<void>;
};

/** A place other plugins may render into. */
export type Slot = DescribableWithSchema;

/** What one plugin renders in another's slot. */
export type SlotContribution = {
    slot: string;
    order?: number | undefined;
    requires?: readonly string[] | undefined;
    render: ComponentType<{ payload: unknown }>;
};

/** A page, and what it takes to see it. */
export type Route<Config = unknown, Services = unknown> = {
    path: string;
    component: ComponentType;

    /**
     * What the tab says while this page is open.
     *
     * Required, because a route without one leaves whatever the last page
     * wrote: a reader who lands here from a search result reads the name of
     * somewhere they have never been.
     */
    title: string;

    requires?: readonly string[] | undefined;

    /**
     * What this route reads from the query string.
     *
     * Declared, like everything else: a parameter no route names is one no
     * page may read, and a value that fails this never reaches a component.
     */
    search?: z.ZodType | undefined;

    /**
     * Where the viewer belongs instead, when this page is not it.
     *
     * `requires` answers whether they may see it. This answers a page they
     * may see but should not be on yet: a checkout with an empty cart is not
     * forbidden, it is early. Answering a path sends them there before
     * anything renders, so the wrong screen never flashes.
     *
     * Asked before `requires`. A route naming both is the ordinary
     * signed-out case, where "not yours to open" is no use to somebody
     * nobody has asked to sign in yet.
     */
    instead?: ((ctx: Context<Config, Services>) => string | undefined) | undefined;

};

/** What a component sees when a contribution or a page threw. */
export type FallbackProps = {
    error: unknown;
    plugin: string;
    reset: () => void;
};

/** What shows when a viewer may not see a page, or nothing declared it. */
export type Pages = {
    forbidden?: FunctionComponent<{ permission?: string | undefined }>;
    missing?: FunctionComponent | undefined;
};

/** Where a plugin's lines go. The application decides. */
export type Logger = {
    debug: (line: string, about?: Readonly<Record<string, unknown>>) => void;
    info: (line: string, about?: Readonly<Record<string, unknown>>) => void;
    warn: (line: string, about?: Readonly<Record<string, unknown>>) => void;
    error: (line: string, about?: Readonly<Record<string, unknown>>) => void;
};

/** One request, as a plugin makes it. */
export type CallOptions = {
    query?: Readonly<Record<string, string | number | boolean | null | undefined>> | undefined;
    body?: unknown;
    headers?: Readonly<Record<string, string>> | undefined;
    signal?: AbortSignal | undefined;
};

/**
 * What the kernel needs to reach a server.
 *
 * A shape, not our transport: anything matching it satisfies the kernel, and
 * the two never import each other.
 *
 * Every method answers the body the server sent and nothing wrapped around
 * it: a 2xx is the parsed body, a 204 is `undefined`, and anything else
 * throws. A fake answering `{ status, body }` describes the channel
 * underneath rather than this, and every call written against it is wrong.
 */
export type HttpClient = {
    get: (path: string, request?: CallOptions) => Promise<unknown>;
    post: (path: string, request?: CallOptions) => Promise<unknown>;
    put: (path: string, request?: CallOptions) => Promise<unknown>;
    patch: (path: string, request?: CallOptions) => Promise<unknown>;
    delete: (path: string, request?: CallOptions) => Promise<unknown>;
};

/** What the kernel needs to drop what a view is holding. */
export type Cache = {
    invalidate: (key: readonly unknown[]) => void;
};

/** What the kernel needs to hear a server push. */
export type Realtime = {
    channel: () => "ws" | "http";
    subscribe: (channel: string, receive: (message: unknown) => void) => { close: () => void };
};

/** What every plugin function receives. */
export type Context<Config = unknown, Services = unknown> = {
    name: string;
    config: Config;
    services: Services;

    log: Logger;
    http: HttpClient;
    cache: Cache;
    realtime: Realtime;

    events: {
        emit: (event: string, payload: unknown) => void;

        /**
         * Hears an event for as long as the caller wants, and answers what
         * stops it.
         *
         * A contract's `listens` is for a plugin: it starts with the kernel
         * and never stops. This is for a view, which arrives and leaves, and
         * must take its ear with it.
         */
        on: (event: string, handle: (payload: unknown) => void) => () => void;
    };

    hooks: {
        /** Runs a hook and answers the first refusal, or undefined. */
        run: (hook: string, payload: unknown) => Promise<string | undefined>;
    };

    permissions: {
        has: (permission: string) => boolean;
        all: (permissions: readonly string[]) => boolean;

        /**
         * Says the answer moved, so every guard asks again.
         *
         * What a viewer may do is the one declaration that is not static: it
         * depends on who is looking, and that changes while the page is open.
         * The plugin holding identity calls this when a session ends, starts
         * or takes a different role, and the guards catch up without the
         * application reloading itself.
         */
        changed: () => void;

        /** Runs `notify` whenever `changed` is called. Returns a stop. */
        watch: (notify: () => void) => () => void;
    };

    commands: {
        run: (command: string, input: unknown) => Promise<void>;
    };

    /**
     * Another plugin's services, by name.
     *
     * Reachable outside a component, so a plain function can use it: an API
     * only a React hook could reach left half an application unable to call
     * it.
     */
    use: <Api>(plugin: string) => Api;
};

type Given<Api> = NoInfer<Api>;

/** Everything a plugin declares about itself. */
export type Definition<Schema extends z.ZodType = z.ZodType, Services = unknown> = Describable & {
    version: string;
    dependsOn?: readonly string[] | undefined;
    config?: Schema | undefined;

    permissions?: Readonly<Record<string, Permission>> | undefined;

    /**
     * What the viewer may do, read on every check.
     *
     * At most one plugin offers this: two sources would make an answer depend
     * on which was asked, and a permission that flickers is worse than one
     * that is simply absent.
     *
     * This decides what a viewer sees, never what they may do. The server
     * checks again, and is the only place a refusal counts.
     */
    grants?: ((ctx: Context<z.infer<Schema>, Given<Services>>) => readonly string[]) | undefined;

    services?: ((ctx: Context<z.infer<Schema>, never>) => Services) | undefined;
    fallback?: ComponentType<FallbackProps> | undefined;

    /**
     * The frame every page renders inside.
     *
     * At most one plugin offers this. An application that named its own would
     * be naming a plugin, which is the thing the kernel exists to avoid.
     */
    frame?: FunctionComponent | undefined;

    /**
     * What shows instead of a page: 403 when a permission is missing, 404 when
     * nothing declared the path. At most one plugin offers each.
     */
    pages?: Pages | undefined;

    routes?: readonly Route<z.infer<Schema>, Given<Services>>[] | undefined;
    slots?: Readonly<Record<string, Slot>> | undefined;
    contributes?: readonly SlotContribution[] | undefined;

    emits?: Readonly<Record<string, Event>> | undefined;
    listens?: Readonly<Record<string, Listener<Context<z.infer<Schema>, Given<Services>>>>> | undefined;

    hooks?: Readonly<Record<string, Hook>> | undefined;
    participates?: Readonly<Record<string, Participant<Context<z.infer<Schema>, Given<Services>>>>> | undefined;

    commands?: Readonly<Record<string, Command<Context<z.infer<Schema>, Given<Services>>>>> | undefined;

    /**
     * What this plugin adds to the headers of every request the kit makes.
     *
     * Asked on each request, so a value that changes is read again. Two
     * plugins naming the same header is refused, because a header with two
     * authors is one nobody owns.
     *
     * Requests never leave `baseUrl`, so what is declared here reaches only
     * the application's own server.
     */
    sends?: ((ctx: Context<z.infer<Schema>, Given<Services>>) => Readonly<Record<string, string>>) | undefined;

    setup?: ((ctx: Context<z.infer<Schema>, Given<Services>>) => void | Promise<void>) | undefined;
    teardown?: ((ctx: Context<z.infer<Schema>, Given<Services>>) => void | Promise<void>) | undefined;
};

/** A plugin: its name, and what it declared. */
export type Plugin = {
    name: string;
    definition: Definition;
};
