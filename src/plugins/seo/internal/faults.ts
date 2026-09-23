/** Every problem a prerender found, before it wrote anything. */
export class SeoFault extends Error
{
    readonly code = "REFUSED_PRERENDER";
    readonly problems: readonly string[];

    constructor(problems: readonly string[])
    {
        super(`seo: nothing was written.\n${problems.map((problem) => `  - ${problem}`).join("\n")}`);
        this.name = "SeoFault";
        this.problems = problems;
    }
}
