import type { Plugin } from "../../kernel/api";
import { SettingsFault } from "./faults";
import { prefix, prefixOf, problemsOf, publicSuffixes, variableOf } from "./variables";

export type PluginConfig = Readonly<Record<string, Readonly<Record<string, string>>>>;

function fieldsOf(plugin: Plugin): readonly string[] | undefined
{
    const shape: unknown = (plugin.definition.config as { shape?: unknown } | undefined)?.shape;

    return typeof shape === "object" && shape !== null ? Object.keys(shape) : undefined;
}

export function configFor(plugins: readonly Plugin[], environment: Readonly<Record<string, unknown>>): PluginConfig
{
    const problems: string[] = [];
    const config: Record<string, Record<string, string>> = {};

    for (const plugin of plugins)
    {
        const given = Object.keys(environment).filter((name) => name.startsWith(prefixOf(plugin.name))).sort();

        if (given.length === 0)
        {
            continue;
        }

        const fields = fieldsOf(plugin);

        if (fields === undefined)
        {
            problems.push(...given.map((name) => `${name} is set, but "${plugin.name}" declares no z.object config for it to reach. Remove it, or declare config in the plugin.`));

            continue;
        }

        const byVariable = new Map(fields.map((field) => [variableOf(plugin.name, field), field]));
        const values: Record<string, string> = {};

        for (const name of given)
        {
            const field = byVariable.get(name);
            const value = environment[name];

            if (field === undefined)
            {
                problems.push(`${name} names no field of "${plugin.name}". Its variables are ${[...byVariable.keys()].join(", ") || "none"}.`);

                continue;
            }

            const unsafe = problemsOf([name], { application: [], suffixes: publicSuffixes, prefixes: [prefix] });

            if (unsafe.length > 0)
            {
                problems.push(...unsafe);

                continue;
            }

            if (typeof value === "string")
            {
                values[field] = value;
            }
        }

        if (Object.keys(values).length > 0)
        {
            config[plugin.name] = values;
        }
    }

    if (problems.length > 0)
    {
        throw new SettingsFault("settings: the environment was refused.", problems);
    }

    return config;
}
