/** Every problem found at once, one line each; `problems` lets a caller show them apart. */
export class SettingsFault extends Error
{
    readonly code = "REFUSED_SETTINGS";
    readonly problems: readonly string[];

    constructor(what: string, problems: readonly string[])
    {
        super(`${what}\n${problems.map((problem) => `  - ${problem}`).join("\n")}`);
        this.name = "SettingsFault";
        this.problems = problems;
    }
}
