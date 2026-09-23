import { KernelFault } from "../../kernel/api";

function candidatesOf(accepted: string | readonly string[]): string[]
{
    if (typeof accepted !== "string")
    {
        return accepted.map((tag) => tag.trim()).filter((tag) => tag !== "" && tag !== "*");
    }

    return accepted
        .split(",")
        .map((part, at) =>
        {
            const [tag = "", ...parameters] = part.trim().split(";").map((piece) => piece.trim());
            const quality = parameters.map((parameter) => /^q=([0-9.]+)$/i.exec(parameter)?.[1]).find((value) => value !== undefined);

            return { tag, weight: quality === undefined ? 1 : Number(quality), at };
        })
        .filter((candidate) => candidate.tag !== "" && candidate.tag !== "*" && candidate.weight > 0 && Number.isFinite(candidate.weight))
        .sort((left, right) => right.weight - left.weight || left.at - right.at)
        .map((candidate) => candidate.tag);
}

function languageOf(tag: string): string
{
    return tag.toLowerCase().split("-")[0] ?? "";
}

export function negotiate(accepted: string | readonly string[], supported: readonly string[], fallback: string, chosen?: string): string
{
    const lowered = supported.map((tag) => tag.toLowerCase());

    if (!lowered.includes(fallback.toLowerCase()))
    {
        throw new KernelFault("INVALID_CONFIG", `locale: fallback "${fallback}" is not one of the supported tags (${supported.join(", ")}). Name one of them.`);
    }

    const find = (tag: string): string | undefined => supported[lowered.indexOf(tag.toLowerCase())];

    if (chosen !== undefined && find(chosen) !== undefined)
    {
        return find(chosen) ?? fallback;
    }

    for (const candidate of candidatesOf(accepted))
    {
        const exact = find(candidate);

        if (exact !== undefined)
        {
            return exact;
        }

        const language = languageOf(candidate);
        const sameLanguage = supported.find((tag) => languageOf(tag) === language);

        if (sameLanguage !== undefined)
        {
            return sameLanguage;
        }
    }

    return find(fallback) ?? fallback;
}
