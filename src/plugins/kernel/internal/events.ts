import type { Event, Listener } from "./contract";
import { KernelFault } from "./faults";
import * as names from "./names";

/** A delivery that threw, kept so an application can see it happened. */
export type Failure = {
    event: string;
    plugin: string;
    error: unknown;
    at: number;
};

type Subscriber<Context> = { plugin: string; listener: Listener<Context> };

export function events<Context>(now: () => number = Date.now)
{
    const declaredBy = new Map<string, { owner: string; event: Event }>();
    const listeners = new Map<string, Subscriber<Context>[]>();
    const failures: Failure[] = [];

    return {
        declare: (owner: string, name: string, event: Event): void =>
        {
            declaredBy.set(name, { owner, event });
        },

        listen: (plugin: string, name: string, listener: Listener<Context>): (() => void) =>
        {
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
                        failures.push({ event: name, plugin: to.plugin, error, at: now() });
                    });
                }
                catch (error)
                {
                    failures.push({ event: name, plugin: to.plugin, error, at: now() });
                }
            }
        },

        failures: (): readonly Failure[] =>
        {
            return [...failures];
        },

        owner: (name: string): string | undefined =>
        {
            return declaredBy.get(name)?.owner ?? names.owner(name);
        },
    };
}
