import { z } from "zod";

import type { SlotContribution, Slot } from "./contract";
import { KernelFault } from "./faults";
import type { registries } from "./registries";

/** One thing to render in a slot, and what it needs to be seen. */
export type MountedContribution = SlotContribution & { plugin: string };

const Contribution = z.object({
    render: z.custom<SlotContribution["render"]>((value) => typeof value === "function" || (typeof value === "object" && value !== null), "render must be a component"),
    order: z.number().optional(),
    requires: z.array(z.string()).optional(),
}).passthrough();

// A slot is a registry of contributions, so one that arrives at run time (ctx.registry(slot).set) renders like a declared one.
export function slots(lists: ReturnType<typeof registries>)
{
    const openedBy = new Map<string, { owner: string; slot: Slot }>();

    return {
        declare: (owner: string, name: string, slot: Slot): void =>
        {
            openedBy.set(name, { owner, slot });
            lists.declare(owner, name, { describe: slot.describe, entry: Contribution, key: "id" }, true);
        },

        fill: (plugin: string, contribution: SlotContribution): void =>
        {
            lists.add(plugin, contribution.slot, contribution);
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

            const contributions = lists.list(name).map((entry) => ({ ...entry, slot: name }) as unknown as MountedContribution);

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

        // a stopped kernel that starts again must not mount a contribution twice
        reset: (): void =>
        {
            openedBy.clear();
        },
    };
}
