import { z } from "zod";

import type { Context, HttpClient, Realtime } from "./contract";
import type { events } from "./events";
import type { LogFn } from "./kernel";
import type { registries } from "./registries";

const Snapshot = z.object({ version: z.number().int().nonnegative(), entries: z.array(z.unknown()) });

// "skip" is a change to an entry this viewer may not see: the version moves, and neither key nor entry leaks.
const Frame = z.union([
    z.object({ version: z.number().int().nonnegative(), op: z.enum(["set", "remove"]), key: z.string().min(1), entry: z.unknown().optional() }),
    z.object({ version: z.number().int().nonnegative(), op: z.literal("skip") }),
]);

type Mirrored = {
    feed: (entries: readonly unknown[]) => number;
    patch: (key: string, entry: unknown) => boolean;
};

// A snapshot, then each push whose version is the next one. Any gap fetches the
// snapshot again, since the socket never replays what it missed.
export function mirror(remote: string, into: Mirrored, http: HttpClient, realtime: Realtime, warn: (line: string, about?: Readonly<Record<string, unknown>>) => void)
{
    let version: number | undefined;
    let generation = 0;
    let subscription: { close: () => void } | undefined;

    async function fetchSnapshot(): Promise<void>
    {
        generation += 1;

        const asked = generation;
        let body: unknown;

        try
        {
            body = await http.get(`/registries/${remote}`);
        }
        catch (cause)
        {
            warn(`registry "${remote}" could not load its snapshot; it stays as it was`, { cause: cause instanceof Error ? cause.message : String(cause) });

            return;
        }

        // an answer to an earlier identity, or after a later snapshot, must not overwrite what the current one sees
        if (asked !== generation)
        {
            return;
        }

        const read = Snapshot.safeParse(body);

        if (!read.success)
        {
            warn(`registry "${remote}" answered a snapshot without { version, entries }; it stays as it was`);

            return;
        }

        const dropped = into.feed(read.data.entries);

        version = read.data.version;

        if (dropped > 0)
        {
            warn(`registry "${remote}" dropped ${dropped} entries its schema refuses`, { dropped });
        }
    }

    function heard(message: unknown): void
    {
        const read = Frame.safeParse(message);

        if (!read.success || version === undefined || read.data.version <= version)
        {
            return;
        }

        const frame = read.data;

        if (frame.version !== version + 1 || (frame.op !== "skip" && !into.patch(frame.key, frame.op === "remove" ? undefined : frame.entry)))
        {
            void fetchSnapshot();

            return;
        }

        version = read.data.version;
    }

    return {
        start: (): Promise<void> =>
        {
            subscription = realtime.subscribe(`registry.${remote}`, heard);

            return fetchSnapshot();
        },

        refetch: (): Promise<void> =>
        {
            return fetchSnapshot();
        },

        // the old identity's answer may still be in flight; the new generation ignores it
        drop: (): void =>
        {
            generation += 1;
            version = undefined;
            into.feed([]);
        },

        stop: (): void =>
        {
            generation += 1;
            subscription?.close();
            subscription = undefined;
        },
    };
}

// Every registry fed by the server starts its mirror; each reads its snapshot again once the socket is back.
export function startMirrors(lists: ReturnType<typeof registries>, bus: ReturnType<typeof events<Context>>, http: HttpClient, realtime: Realtime, log: LogFn, mirrors: Map<string, ReturnType<typeof mirror>>): void
{
    for (const { name, remote } of lists.remotes())
    {
        const owner = lists.ownerOf(name) ?? "kernel";
        const one = mirror(remote, {
            feed: (entries) => lists.feed(name, entries),
            patch: (key, entry) => lists.patch(name, key, entry),
        }, http, realtime, (line, about) =>
        {
            log("warn", owner, line, about);
        });

        mirrors.set(name, one);
        void one.start();
    }

    if (mirrors.size > 0)
    {
        try
        {
            // pushes sent while the socket was down are lost, so every mirror reads its snapshot again
            bus.listen("kernel", "transport.reconnected", {
                describe: "Registries mirroring the server read their snapshot again.",
                handle: () =>
                {
                    for (const one of mirrors.values())
                    {
                        void one.refetch();
                    }
                },
            }, () => true);
        }
        catch
        {
            log("debug", "kernel", "no transport.reconnected event is declared; mirrored registries refetch only on a gap or a session change");
        }
    }
}
