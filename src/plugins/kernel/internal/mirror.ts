import { z } from "zod";

import type { HttpClient, Realtime } from "./contract";

const Snapshot = z.object({ version: z.number().int().nonnegative(), entries: z.array(z.unknown()) });

const Frame = z.object({
    version: z.number().int().nonnegative(),
    op: z.enum(["set", "remove"]),
    key: z.string().min(1),
    entry: z.unknown().optional(),
});

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

        if (read.data.version !== version + 1 || !into.patch(read.data.key, read.data.op === "remove" ? undefined : read.data.entry))
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
