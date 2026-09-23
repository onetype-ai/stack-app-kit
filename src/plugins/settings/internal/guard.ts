import { SettingsFault } from "./faults";
import { problemsOf, publicSuffixes } from "./variables";
import type { PublicRule } from "./variables";

export type PublicOptions = Partial<PublicRule>;

export type BuildGuard = {
    name: string;
    configResolved: () => void;
};

export function publicProblemsOf(names: readonly string[], options: PublicOptions = {}): string[]
{
    return problemsOf(names, { application: options.application ?? [], suffixes: options.suffixes ?? publicSuffixes });
}

export function refusingSecrets(names: readonly string[], options?: PublicOptions): BuildGuard
{
    return {
        name: "stack-app-kit:settings",
        configResolved: () =>
        {
            const problems = publicProblemsOf(names, options);

            if (problems.length > 0)
            {
                throw new SettingsFault("settings: refusing to build, since every VITE_ value ships in the public bundle.", problems);
            }
        },
    };
}
