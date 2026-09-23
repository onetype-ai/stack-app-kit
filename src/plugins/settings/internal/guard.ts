import { SettingsFault } from "./faults";
import { prefix, problemsOf, publicSuffixes } from "./variables";
import type { PublicRule } from "./variables";

export type PublicOptions = Partial<PublicRule>;

export type ResolvedBuild = {
    env: Readonly<Record<string, unknown>>;
    envPrefix?: string | readonly string[] | undefined;
};

export type BuildGuard = {
    name: string;
    configResolved: (config: ResolvedBuild) => void;
};

export function publicProblemsOf(names: readonly string[], options: PublicOptions = {}): string[]
{
    return problemsOf(names, {
        application: options.application ?? [],
        suffixes: options.suffixes ?? publicSuffixes,
        prefixes: options.prefixes ?? [prefix],
    });
}

export function refusingSecrets(options: Omit<PublicOptions, "prefixes"> = {}): BuildGuard
{
    return {
        name: "stack-app-kit:settings",
        configResolved: (config) =>
        {
            const prefixes = typeof config.envPrefix === "string" ? [config.envPrefix] : config.envPrefix ?? [prefix];
            const problems = publicProblemsOf(Object.keys(config.env), { ...options, prefixes });

            if (problems.length > 0)
            {
                throw new SettingsFault("settings: refusing to build, since every public variable ships in the bundle.", problems);
            }
        },
    };
}
