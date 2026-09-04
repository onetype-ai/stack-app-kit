import type { Hook, Participant } from "./contract";
import { KernelFault } from "./faults";

type Participating<Context> = { plugin: string; participant: Participant<Context> };

/**
 * Hook points: where a plugin inspects what is about to happen and may refuse.
 *
 * The one mechanism carrying a veto. If nothing can be stopped by it, it is
 * an event.
 */
export function hooks<Context>()
{
    const declared = new Map<string, { owner: string; hook: Hook }>();
    const participants = new Map<string, Participating<Context>[]>();

    return {
        declare: (owner: string, name: string, hook: Hook): void =>
        {
            declared.set(name, { owner, hook });
        },

        participate: (plugin: string, name: string, participant: Participant<Context>): void =>
        {
            participants.set(name, [...(participants.get(name) ?? []), { plugin, participant }]);
        },

        /**
         * Runs every participant in order and answers the first refusal.
         *
         * A participant that throws is a refusal, never consent: a plugin
         * whose check crashed has not agreed to anything.
         */
        run: async (plugin: string, name: string, payload: unknown, ctx: (plugin: string) => Context): Promise<string | undefined> =>
        {
            const owned = declared.get(name);

            if (owned === undefined)
            {
                throw new KernelFault("UNDECLARED_HOOK", `"${plugin}" ran "${name}", which no plugin declares. Add it to hooks.`, { plugin });
            }

            if (owned.owner !== plugin)
            {
                throw new KernelFault("UNDECLARED_HOOK", `"${plugin}" ran "${name}", which belongs to "${owned.owner}". A plugin runs only the hooks it owns.`, { plugin, detail: { owner: owned.owner } });
            }

            const answer = owned.hook.schema.safeParse(payload);

            if (!answer.success)
            {
                throw new KernelFault("INVALID_PAYLOAD", `The payload for "${name}" does not match its schema: ${answer.error.issues[0]?.message ?? "it was rejected"}.`, { plugin });
            }

            for (const one of participants.get(name) ?? [])
            {
                try
                {
                    const said = await one.participant.handle(answer.data, ctx(one.plugin));

                    if (said !== undefined)
                    {
                        return said;
                    }
                }
                catch (cause)
                {
                    return `"${one.plugin}" refused: ${cause instanceof Error ? cause.message : String(cause)}`;
                }
            }

            return undefined;
        },
    };
}
