/** Every problem a prerender found, before it wrote anything. */
export class SeoFault extends Error
{
    readonly code = "REFUSED_PRERENDER";
    readonly problems: readonly string[];

    constructor(problems: readonly string[], what = "seo: nothing was written.")
    {
        super(`${what}\n${problems.map((problem) => `  - ${problem}`).join("\n")}`);
        this.name = "SeoFault";
        this.problems = problems;
    }
}
