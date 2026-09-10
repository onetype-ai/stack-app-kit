import type { SlotContribution, Slot } from "./contract";
import { KernelFault } from "./faults";

/** One thing to render in a slot, and what it needs to be seen. */
export type MountedContribution = SlotContribution & { plugin: string };

export function slots()
{
    const openedBy = new Map<string, { owner: string; slot: Slot }>();
    const placed = new Map<string, MountedContribution[]>();

    return {
        declare: (owner: string, name: string, slot: Slot): void =>
        {
            openedBy.set(name, { owner, slot });
        },

        fill: (plugin: string, contribution: SlotContribution): void =>
        {
            placed.set(contribution.slot, [...(placed.get(contribution.slot) ?? []), { ...contribution, plugin }]);
        },

        known: (name: string): boolean =>
        {
            return openedBy.has(name);
        },

        contentsOf: (name: string, payload: unknown): { contributions: readonly MountedContribution[]; payload: unknown; problem?: string } =>
        {
            const opened = openedBy.get(name);

            if (opened === undefined)
            {
                return { contributions: [], payload, problem: `Slot "${name}" is not declared by any plugin.` };
            }

            const answer = opened.slot.schema.safeParse(payload ?? {});

            if (!answer.success)
            {
                return {
                    contributions: [],
                    payload,
                    problem: `The payload for slot "${name}" does not match its schema: ${answer.error.issues[0]?.message ?? "it was rejected"}.`,
                };
            }

            const contributions = [...(placed.get(name) ?? [])].sort((first, second) => (first.order ?? 0) - (second.order ?? 0));

            return { contributions, payload: answer.data };
        },

        payload: (name: string, payload: unknown): unknown =>
        {
            const opened = openedBy.get(name);

            if (opened === undefined)
            {
                throw new KernelFault("UNDECLARED_SLOT", `Slot "${name}" is not declared by any plugin.`);
            }

            return opened.slot.schema.parse(payload ?? {});
        },
    };
}
