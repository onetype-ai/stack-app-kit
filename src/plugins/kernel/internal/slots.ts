import type { Contribution, Slot } from "./contract";
import { KernelFault } from "./faults";

/** One thing to render in a slot, and what it needs to be seen. */
export type PlacedContribution = Contribution & { plugin: string };

/**
 * Slots: where one plugin renders inside another.
 *
 * A slot that validated its contributions and rendered nowhere, and one that
 * rendered without passing the payload, were both defects of the previous
 * build. So a slot is only useful if `filled` is read and the payload reaches
 * the component.
 */
export function slots()
{
    const declared = new Map<string, { owner: string; slot: Slot }>();
    const placed = new Map<string, PlacedContribution[]>();

    return {
        declare: (owner: string, name: string, slot: Slot): void =>
        {
            declared.set(name, { owner, slot });
        },

        fill: (plugin: string, contribution: Contribution): void =>
        {
            placed.set(contribution.slot, [...(placed.get(contribution.slot) ?? []), { ...contribution, plugin }]);
        },

        /** Whether anyone declared this slot. A view asks before it renders. */
        known: (name: string): boolean =>
        {
            return declared.has(name);
        },

        /**
         * What goes in a slot, in order, and checked against the slot's own
         * schema: a contribution rendered with a payload the slot never
         * promised is a crash inside someone else's component.
         */
        filled: (name: string, payload: unknown): { contributions: readonly PlacedContribution[]; problem?: string } =>
        {
            const slot = declared.get(name);

            if (slot === undefined)
            {
                return { contributions: [], problem: `Slot "${name}" is not declared by any plugin.` };
            }

            // A slot taking no payload is rendered as <Slot name="x" />, which
            // passes nothing. Parsing that as {} lets an empty schema hold,
            // and still refuses a payload a schema actually wants.
            const answer = slot.slot.schema.safeParse(payload ?? {});

            if (!answer.success)
            {
                return {
                    contributions: [],
                    problem: `The payload for slot "${name}" does not match its schema: ${answer.error.issues[0]?.message ?? "it was rejected"}.`,
                };
            }

            const contributions = [...(placed.get(name) ?? [])].sort((first, second) => (first.order ?? 0) - (second.order ?? 0));

            return { contributions };
        },

        /** The validated payload a slot passes on, or a refusal. */
        payload: (name: string, payload: unknown): unknown =>
        {
            const slot = declared.get(name);

            if (slot === undefined)
            {
                throw new KernelFault("UNDECLARED_SLOT", `Slot "${name}" is not declared by any plugin.`);
            }

            return slot.slot.schema.parse(payload ?? {});
        },
    };
}
