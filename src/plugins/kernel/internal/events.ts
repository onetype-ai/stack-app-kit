import type { Event, Listener } from "./contract";
import { KernelFault } from "./faults";
import * as names from "./names";

/** A delivery that threw, kept so an application can see it happened. */
export type ListenerFailure = {
    event: string;
    plugin: string;
    error: unknown;
    atMs: number;
};

type Subscriber<Context> = { plugin: string; listener: Listener<Context> };

export function events<Context>(now: () => number = Date.now, report?: (failure: ListenerFailure) => void)
{
    const declaredBy = new Map<string, { owner: string; event: Event }>();
    const listeners = new Map<string, Subscriber<Context>[]>();
    const failures: ListenerFailure[] = [];

    // held for failures() to read, and reported: a listener that threw was
    // invisible unless the application happened to poll
    const record = (failure: ListenerFailure): void =>
    {
        failures.push(failure);
        report?.(failure);
    };

    return {
        declare: (owner: string, name: string, event: Event): void =>
        {
            declaredBy.set(name, { owner, event });
        },

        listen: (plugin: string, name: string, listener: Listener<Context>, reaches?: (owner: string) => boolean): (() => void) =>
        {
            // listens{} is checked at start; ctx.events.on was not, so a typo
            // made a listener that never fired and never said why
            const owned = declaredBy.get(name);

            if (owned === undefined)
            {
                throw new KernelFault("UNDECLARED_EVENT", `"${plugin}" listened for "${name}", which no plugin declares. Check the name, or declare it in emits.`, { plugin });
            }

            if (reaches !== undefined && !reaches(owned.owner))
            {
                throw new KernelFault("UNDECLARED_DEPENDENCY", `"${plugin}" listened for "${name}", which "${owned.owner}" owns. Name "${owned.owner}" in dependsOn.`, { plugin });
            }

            const subscriber: Subscriber<Context> = { plugin, listener };

            listeners.set(name, [...(listeners.get(name) ?? []), subscriber]);

            return () =>
            {
                listeners.set(name, (listeners.get(name) ?? []).filter((each) => each !== subscriber));
            };
        },

        emit: (plugin: string, name: string, payload: unknown, ctx: (plugin: string) => Context): void =>
        {
            const owned = declaredBy.get(name);

            if (owned === undefined)
            {
                throw new KernelFault("UNDECLARED_EVENT", `"${plugin}" emitted "${name}", which no plugin declares. Add it to emits.`, { plugin });
            }

            if (owned.owner !== plugin)
            {
                throw new KernelFault("UNDECLARED_EVENT", `"${plugin}" emitted "${name}", which belongs to "${owned.owner}". A plugin emits only what it owns.`, { plugin, detail: { owner: owned.owner } });
            }

            const answer = owned.event.schema.safeParse(payload);

            if (!answer.success)
            {
                throw new KernelFault("INVALID_PAYLOAD", `The payload for "${name}" does not match its schema: ${answer.error.issues[0]?.message ?? "it was rejected"}.`, { plugin });
            }

            for (const to of listeners.get(name) ?? [])
            {
                if (to.plugin === plugin)
                {
                    continue;
                }

                try
                {
                    const running = to.listener.handle(answer.data, ctx(to.plugin));

                    void Promise.resolve(running).catch((error: unknown) =>
                    {
                        record({ event: name, plugin: to.plugin, error, atMs: now() });
                    });
                }
                catch (error)
                {
                    record({ event: name, plugin: to.plugin, error, atMs: now() });
                }
            }
        },

        failures: (): readonly ListenerFailure[] =>
        {
            return [...failures];
        },

        owner: (name: string): string | undefined =>
        {
            return declaredBy.get(name)?.owner ?? names.owner(name);
        },

        // a stopped kernel that starts again must not deliver twice
        reset: (): void =>
        {
            declaredBy.clear();
            listeners.clear();
            failures.length = 0;
        },
    };
}
