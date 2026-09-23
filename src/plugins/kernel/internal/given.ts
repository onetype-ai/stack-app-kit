import type { Cache, HttpClient, Realtime } from "./contract";
import { KernelFault } from "./faults";
import type { KernelOptions } from "./kernel";

function missing(what: string, field: string): never
{
    throw new KernelFault(
        "NOT_STARTED",
        `A plugin used ctx.${field}, but no ${what} was given to createKernel. Pass one as \`${field}\`.`,
    );
}

const noClient: HttpClient = {
    get: () =>
    {
        return missing("http client", "http");
    },
    post: () =>
    {
        return missing("http client", "http");
    },
    put: () =>
    {
        return missing("http client", "http");
    },
    patch: () =>
    {
        return missing("http client", "http");
    },
    delete: () =>
    {
        return missing("http client", "http");
    },
    upload: () =>
    {
        return missing("http client", "http");
    },
};

const noCache: Cache = {
    invalidate: () =>
    {
        return missing("cache", "cache");
    },

    clear: () =>
    {
        return missing("cache", "cache");
    },

    prefetch: () =>
    {
        return missing("cache", "cache");
    },
};

const noRealtime: Realtime = {
    channel: () =>
    {
        return "http";
    },

    // a subscription that returns quietly looks live and delivers nothing
    subscribe: () =>
    {
        return missing("realtime", "realtime");
    },

    reconnect: () => {},
};

// What a plugin reaches as ctx.http, ctx.cache and ctx.realtime: what the application gave, or a stand-in naming what to give.
export function given(options: KernelOptions): { http: HttpClient; cache: Cache; realtime: Realtime }
{
    const givenHttp = options.http ?? noClient;
    const http: HttpClient = {
        get: (path, request) => givenHttp.get(path, request),
        post: (path, request) => givenHttp.post(path, request),
        put: (path, request) => givenHttp.put(path, request),
        patch: (path, request) => givenHttp.patch(path, request),
        delete: (path, request) => givenHttp.delete(path, request),
        upload: (path, body, request) =>
        {
            if (givenHttp.upload === undefined)
            {
                throw new KernelFault("NOT_STARTED", "A plugin used ctx.http.upload(), and the http client given to createKernel has no upload. Give one that uploads, as start does.");
            }

            return givenHttp.upload(path, body, request);
        },
    };
    const givenCache = options.cache ?? noCache;
    const cache: Cache = {
        invalidate: (key) =>
        {
            givenCache.invalidate(key);
        },
        clear: () =>
        {
            if (givenCache.clear === undefined)
            {
                throw new KernelFault("NOT_STARTED", "A plugin used ctx.cache.clear(), and the cache given to createKernel has no clear. Give one that drops every entry, as cache.fromQueries does.");
            }

            givenCache.clear();
        },
        prefetch: (key, fetch) =>
        {
            if (givenCache.prefetch === undefined)
            {
                throw new KernelFault("NOT_STARTED", "A plugin used ctx.cache.prefetch(), and the cache given to createKernel has no prefetch. Give one that fetches into itself, as cache.fromQueries does.");
            }

            return givenCache.prefetch(key, fetch);
        },
    };
    const givenRealtime = options.realtime ?? noRealtime;
    const realtime: Realtime = {
        channel: () => givenRealtime.channel(),
        subscribe: (topic, receive, refused) => givenRealtime.subscribe(topic, receive, refused),
        reconnect: () =>
        {
            givenRealtime.reconnect?.();
        },
    };

    return { http, cache, realtime };
}
