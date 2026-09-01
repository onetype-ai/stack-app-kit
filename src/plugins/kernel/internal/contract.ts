import type { ComponentType, FunctionComponent } from "react";
import type { z } from "zod";

/** Anything declared carries a sentence saying what it is for. */
export type Described = {
    describe: string;
};

/** A declaration whose payload is checked before it reaches anyone. */
export type Schematic = Described & {
    schema: z.ZodType;
};

/** What a plugin may do, named so an application can grant it. */
export type Permission = Described;

/** An event a plugin publishes. */
export type Event = Schematic;

/**
 * What a listener does when an event arrives.
 *
 * `payload` is `unknown`, never `never`: a handler typed `(payload: never)`
 * accepts any annotation its author writes, because of contravariance, so the
 * compiler endorses a claim about a completely different schema. `unknown`
 * forces the parse that should happen anyway.
 */
export type Listener<Context> = Described & {
    handle: (payload: unknown, ctx: Context) => void | Promise<void>;
};

/** A point where a plugin may refuse what is about to happen. */
export type Hook = Schematic;

/** What a participant answers: nothing to allow, a reason to refuse. */
export type Participant<Context> = Described & {
    handle: (payload: unknown, ctx: Context) => string | undefined | Promise<string | undefined>;
};

/** Something a plugin can be asked to do, behind the permissions it names. */
export type Command<Context> = Schematic & {
    requires?: readonly string[];
    run: (input: unknown, ctx: Context) => void | Promise<void>;
};

/** A place other plugins may render into. */
export type Slot = Schematic;

/** What one plugin renders in another's slot. */
export type Contribution = {
    slot: string;
    order?: number;
    requires?: readonly string[];
    render: ComponentType<{ payload: unknown }>;
};

/** A page, and what it takes to see it. */
export type Route = {
    path: string;
    component: ComponentType;
    title?: string;
    requires?: readonly string[];
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
    missing?: FunctionComponent;
};

/** Where a plugin's lines go. The application decides. */
export type Logger = {
    debug: (line: string, about?: Readonly<Record<string, unknown>>) => void;
    info: (line: string, about?: Readonly<Record<string, unknown>>) => void;
    warn: (line: string, about?: Readonly<Record<string, unknown>>) => void;
    error: (line: string, about?: Readonly<Record<string, unknown>>) => void;
};

/** One request, as a plugin makes it. */
export type Request = {
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
 */
export type Client = {
    get: (path: string, request?: Request) => Promise<unknown>;
    post: (path: string, request?: Request) => Promise<unknown>;
    put: (path: string, request?: Request) => Promise<unknown>;
    patch: (path: string, request?: Request) => Promise<unknown>;
    delete: (path: string, request?: Request) => Promise<unknown>;
};

/** What the kernel needs to drop what a view is holding. */
export type Cache = {
    invalidate: (key: readonly unknown[]) => void;
};

/** What the kernel needs to hear a server push. */
export type Realtime = {
    channel: () => "ws" | "http";
    subscribe: (channel: string, told: (message: unknown) => void) => { close: () => void };
};

/** What every plugin function receives. */
export type Context<Config = unknown, Services = unknown> = {
    name: string;
    config: Config;
    services: Services;

    log: Logger;
    http: Client;
    cache: Cache;
    realtime: Realtime;

    events: {
        emit: (event: string, payload: unknown) => void;
    };

    hooks: {
        /** Runs a hook and answers the first refusal, or undefined. */
        run: (hook: string, payload: unknown) => Promise<string | undefined>;
    };

    permissions: {
        has: (permission: string) => boolean;
        all: (permissions: readonly string[]) => boolean;
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
    use: <Held>(plugin: string) => Held;
};

/**
 * Blocks inference at this position.
 *
 * Services is inferred from what `services` returns and from nowhere else. A
 * callback taking a context would otherwise be a second inference site, and
 * two candidates for one parameter resolve to unknown.
 */
type Given<Held> = NoInfer<Held>;

/** Everything a plugin declares about itself. */
export type Definition<Schema extends z.ZodType = z.ZodType, Services = unknown> = Described & {
    version: string;
    dependsOn?: readonly string[];
    config?: Schema;

    permissions?: Readonly<Record<string, Permission>>;

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
    grants?: (ctx: Context<z.infer<Schema>, Given<Services>>) => readonly string[];

    services?: (ctx: Context<z.infer<Schema>, never>) => Services;
    fallback?: ComponentType<FallbackProps>;

    /**
     * The frame every page renders inside.
     *
     * At most one plugin offers this. An application that named its own would
     * be naming a plugin, which is the thing the kernel exists to avoid.
     */
    frame?: FunctionComponent;

    /**
     * What shows instead of a page: 403 when a permission is missing, 404 when
     * nothing declared the path. At most one plugin offers each.
     */
    pages?: Pages;

    routes?: readonly Route[];
    slots?: Readonly<Record<string, Slot>>;
    contributes?: readonly Contribution[];

    emits?: Readonly<Record<string, Event>>;
    listens?: Readonly<Record<string, Listener<Context<z.infer<Schema>, Given<Services>>>>>;

    hooks?: Readonly<Record<string, Hook>>;
    participates?: Readonly<Record<string, Participant<Context<z.infer<Schema>, Given<Services>>>>>;

    commands?: Readonly<Record<string, Command<Context<z.infer<Schema>, Given<Services>>>>>;

    setup?: (ctx: Context<z.infer<Schema>, Given<Services>>) => void | Promise<void>;
    teardown?: (ctx: Context<z.infer<Schema>, Given<Services>>) => void | Promise<void>;
};

/** A plugin: its name, and what it declared. */
export type Plugin = {
    name: string;
    definition: Definition;
};
