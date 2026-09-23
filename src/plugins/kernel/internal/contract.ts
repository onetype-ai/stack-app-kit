import type { ComponentType, FunctionComponent, ReactNode } from "react";
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

/** What a listener does when an event arrives: `payload` is `unknown`, never `never`, because contravariance lets a `never` annotation endorse a wrong schema. */
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
    /** What the viewer must hold. This decides what renders, never what is allowed: the browser holds these strings, so the server must refuse the same request independently. */
    requires?: readonly string[] | undefined;
    run: (input: unknown, ctx: Context) => void | Promise<void>;
};

/** A place other plugins may render into. */
export type Slot = DescribableWithSchema;

/** What one plugin renders in another's slot. */
export type SlotContribution = {
    slot: string;
    order?: number | undefined;
    /** What the viewer must hold. This decides what renders, never what is allowed: the browser holds these strings, so the server must refuse the same request independently. */
    requires?: readonly string[] | undefined;
    render: ComponentType<{ payload: unknown }>;
};

/** A page, and what it takes to see it. */
export type Route<Config = unknown, Services = unknown> = {
    path: string;
    component: ComponentType;

    /** What the tab says while this page is open. */
    title: string;

    /** What the viewer must hold. This decides what renders, never what is allowed: the browser holds these strings, so the server must refuse the same request independently. */
    requires?: readonly string[] | undefined;

    /** What this route reads from the query string. */
    search?: z.ZodType | undefined;

    /** Where the viewer belongs instead, when this page is not it: asked before `requires`. */
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

/** What the kernel needs to reach a server: every method answers the bare body, a 2xx parsed, a 204 `undefined`, anything else thrown. */
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
    subscribe: (topic: string, receive: (message: unknown) => void) => { close: () => void };

    /** Dials the socket again with the address as it reads now, keeping every subscription: after sign-in, sign-out or a workspace switch. */
    reconnect: () => void;
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

        /** Hears an event for as long as the caller wants, and answers what stops it. */
        on: (event: string, handle: (payload: unknown) => void) => () => void;
    };

    hooks: {
        /** Runs a hook and answers the first refusal, or undefined. */
        run: (hook: string, payload: unknown) => Promise<string | undefined>;
    };

    permissions: {
        has: (permission: string) => boolean;
        all: (permissions: readonly string[]) => boolean;

        /** Says the answer moved, so every guard asks again: permissions are the one declaration that is not static. */
        changed: () => void;

        /** Runs `notify` whenever `changed` is called. Returns a stop. */
        watch: (notify: () => void) => () => void;
    };

    commands: {
        run: (command: string, input: unknown) => Promise<void>;
    };

    /** Another plugin's services, by name. Reachable outside a component. */
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
     * What the viewer may do, read on every check. At most one plugin offers this.
     *
     * Declaring it REPLACES the `permissions` passed to createKernel entirely:
     * that source is never read again, and is not merged in. The plugin holding
     * the session answers alone, so a sign-out takes every permission with it.
     */
    grants?: ((ctx: Context<z.infer<Schema>, Given<Services>>) => readonly string[]) | undefined;

    /** The closed set `grants` answers from, so a route or contribution requiring a permission outside it is refused at startup rather than never rendering. */
    /** Left out, `grants` may answer anything any plugin declares. Named after OIDC's `scopes_supported`, which it is. */
    grantsSupported?: readonly string[] | undefined;

    services?: ((ctx: Context<z.infer<Schema>, never>) => Services) | undefined;
    fallback?: ComponentType<FallbackProps> | undefined;

    /** The frame every page renders inside. At most one plugin offers this. */
    /** The shell every page renders inside; it is handed the page as its children. */
    frame?: FunctionComponent<{ children?: ReactNode }> | undefined;

    /** What shows instead of a page: 403 when a permission is missing, 404 when nothing declared the path. */
    pages?: Pages | undefined;

    routes?: readonly Route<z.infer<Schema>, Given<Services>>[] | undefined;
    slots?: Readonly<Record<string, Slot>> | undefined;
    contributes?: readonly SlotContribution[] | undefined;

    emits?: Readonly<Record<string, Event>> | undefined;
    listens?: Readonly<Record<string, Listener<Context<z.infer<Schema>, Given<Services>>>>> | undefined;

    hooks?: Readonly<Record<string, Hook>> | undefined;
    participates?: Readonly<Record<string, Participant<Context<z.infer<Schema>, Given<Services>>>>> | undefined;

    commands?: Readonly<Record<string, Command<Context<z.infer<Schema>, Given<Services>>>>> | undefined;

    /** What this plugin adds to the headers of every request the kit makes: asked per request, never sent outside `baseUrl`. */
    sends?: ((ctx: Context<z.infer<Schema>, Given<Services>>) => Readonly<Record<string, string>>) | undefined;

    setup?: ((ctx: Context<z.infer<Schema>, Given<Services>>) => void | Promise<void>) | undefined;
    teardown?: ((ctx: Context<z.infer<Schema>, Given<Services>>) => void | Promise<void>) | undefined;
};

/** A plugin: its name, and what it declared. */
export type Plugin = {
    name: string;
    definition: Definition;
};
