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

type Held<Context> = { plugin: string; listener: Listener<Context> };

/** The event bus: who publishes what, and who hears it. */
export function events<Context>(now: () => number = Date.now)
{
    const declared = new Map<string, { owner: string; event: Event }>();
    const listeners = new Map<string, Held<Context>[]>();
    const failures: Failure[] = [];

    return {
        declare: (owner: string, name: string, event: Event): void =>
        {
            declared.set(name, { owner, event });
        },

        listen: (plugin: string, name: string, listener: Listener<Context>): void =>
        {
            listeners.set(name, [...(listeners.get(name) ?? []), { plugin, listener }]);
        },

        /**
         * Publishes an event, after checking that this plugin owns it and the
         * payload matches what it declared.
         *
         * A payload that fails its schema is refused rather than delivered:
         * every listener would break differently on it, far from here.
         */
        emit: (plugin: string, name: string, payload: unknown, ctx: (plugin: string) => Context): void =>
        {
            const owned = declared.get(name);

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
                    const answered = to.listener.handle(answer.data, ctx(to.plugin));

                    // A listener that returns a promise still must not reach
                    // the emitter: an unhandled rejection would surface as a
                    // failure of whatever emitted, seconds later.
                    void Promise.resolve(answered).catch((error: unknown) =>
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

        /** Every delivery that threw. An application reads this to see them. */
        failures: (): readonly Failure[] =>
        {
            return [...failures];
        },

        owner: (name: string): string | undefined =>
        {
            return declared.get(name)?.owner ?? names.owner(name);
        },
    };
}
