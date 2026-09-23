import type { Context, Plugin, PipelineStep } from "./contract";
import type { events } from "./events";
import type { hooks } from "./hooks";
import type { LogFn } from "./kernel";
import type { pipelines } from "./pipelines";
import type { registries } from "./registries";
import type { slots } from "./slots";

// What start declares before any plugin's services run: every name one plugin owns, then every entry and step
// others add to it. Kept apart from the lifecycle, since each is a table filled once, in dependency order.
export type Declared = {
    bus: ReturnType<typeof events<Context>>;
    points: ReturnType<typeof hooks<Context>>;
    places: ReturnType<typeof slots>;
    lists: ReturnType<typeof registries>;
    flows: ReturnType<typeof pipelines>;
};

export function declareAll(order: readonly Plugin[], { bus, points, places, lists, flows }: Declared): void
{
    for (const plugin of order)
    {
        for (const [key, event] of Object.entries(plugin.definition.emits ?? {}))
        {
            bus.declare(plugin.name, key, event);
        }

        for (const [key, hook] of Object.entries(plugin.definition.hooks ?? {}))
        {
            points.declare(plugin.name, key, hook);
        }

        for (const [key, slot] of Object.entries(plugin.definition.slots ?? {}))
        {
            places.declare(plugin.name, key, slot);
        }

        for (const [key, declared] of Object.entries(plugin.definition.registries ?? {}))
        {
            lists.declare(plugin.name, key, declared);
        }

        for (const [key, declared] of Object.entries(plugin.definition.pipelines ?? {}))
        {
            flows.declare(plugin.name, key, declared);
        }
    }
}

// every refusal at once, as a line each, so start names them together
export function addAll(order: readonly Plugin[], { lists, flows }: Pick<Declared, "lists" | "flows">): string[]
{
    const refused: string[] = [];

    for (const plugin of order)
    {
        for (const [key, entries] of Object.entries(plugin.definition.adds ?? {}))
        {
            if (flows.known(key))
            {
                for (const step of entries)
                {
                    if (typeof (step as Partial<PipelineStep> | null)?.id !== "string" || typeof (step as Partial<PipelineStep> | null)?.run !== "function")
                    {
                        refused.push(`  - Pipeline "${key}" refused a step from "${plugin.name}": it needs id: "<step>" and run: (state, ctx) => ....`);

                        continue;
                    }

                    flows.add(plugin.name, key, step as PipelineStep);
                }

                continue;
            }

            for (const entry of entries)
            {
                try
                {
                    lists.add(plugin.name, key, entry);
                }
                catch (cause)
                {
                    refused.push(`  - ${cause instanceof Error ? cause.message : String(cause)}`);
                }
            }
        }
    }

    refused.push(...flows.settle().map((problem) => `  - ${problem}`));

    return refused;
}

export function explainAll(order: readonly Plugin[], flows: Declared["flows"], log: LogFn): void
{
    for (const plugin of order)
    {
        for (const key of Object.keys(plugin.definition.pipelines ?? {}))
        {
            log("debug", plugin.name, `pipeline "${key}" runs ${flows.explain(key).map((step) => step.id).join(" → ")}`, { steps: flows.explain(key) });
        }
    }
}
