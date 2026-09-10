import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

import { findImportViolations, findShadowedExports, findSharedNames, findSharedVocabulary, findSplitVocabulary } from "./boundaries";
import { findComments, findMissingDocs, findOversizedDocs, findUnexplainedPlugins } from "./docs";
import { findLiterals, findUnknownClasses, findUnknownTokens, findUnmeasured } from "./styling";
import { findDanglingPaths, findUnusedFields, findUnwatched } from "./wiring";

export type ProjectProblem = {
    check: "boundaries" | "wiring" | "unexplained" | "token" | "class" | "comment" | "literal" | "oversized" | "missing" | "dangling" | "twice" | "budget" | "split" | "shadowed";
    message: string;
};

/** What a run did not look at, and why. */
export type ProjectSkipped = {
    check: string;
    message: string;
};

export type ProjectCheckOptions = {
    root?: string;
    plugins?: string;

    /** Where pure code shared between plugins lives. */
    utils?: string;

    /** Where the documents sit while they are a folder. */
    docs?: string;

    /** What every application must hold, whatever else it keeps. */
    required?: readonly string[];

    /** The size a document may reach before it has outgrown its point. */
    limit?: number;

    /** Where style lives outside a stylesheet, as paths under `src`. */
    styleIn?: readonly string[];

    /** Signatures two plugins may each keep, because they answer different questions. */
    sharing?: readonly string[];

    /**
     * Components a plugin writes for itself although one it depends on
     * exports the same name, and means to.
     */
    shadowing?: readonly string[];

    /** Enum names two plugins may each declare, where the two are not one idea. */
    apart?: readonly string[];

    /** Where the other half of this application lives, when it has one. */
    across?: readonly string[];

    /** Built files that must stay under a size, gzipped, as bytes. */
    budgets?: Readonly<Record<string, number>>;
};

/** Every check an application runs on itself, in one call. */
export const Project = {
    required: ["#docs/usage.md", "#docs/stack.md", "#docs/architecture.md"] as const,

    findAll: (checking: ProjectCheckOptions = {}): ProjectProblem[] =>
    {
        const root = checking.root ?? process.cwd();
        const plugins = checking.plugins ?? join(root, "src", "plugins");
        const source = join(root, "src");

        return [
            ...findImportViolations(plugins).map((crossing) => ({ check: "boundaries" as const, message: crossing.message })),

            ...[plugins, checking.utils ?? join(root, "src", "utils"), join(source, "ui")]
                .flatMap((at) => findUnusedFields(at))
                .map((unread) => ({
                    check: "wiring" as const,
                    message: `${unread.file}: ${unread.shape}.${unread.field} is declared and nothing reads it.`,
                })),

            ...findUnexplainedPlugins(plugins).map((name) => ({
                check: "unexplained" as const,
                message: `"${name}" has no usage.md. A plugin nobody can read is one nobody can depend on.`,
            })),

            ...findUnknownTokens(source).map((unknown) => ({
                check: "token" as const,
                message: `${unknown.file}: var(${unknown.token}) is asked for and nothing gives it a value.`,
            })),

            ...findComments(source).map((one) => ({
                check: "comment" as const,
                message: `${one.file}:${String(one.line)} is a comment. What it says goes in a name, or in the name of a test.`,
            })),

            ...findLiterals(source, checking.styleIn).map((one) => ({
                check: "literal" as const,
                message: `${one.file}:${String(one.line)} writes a ${one.kind} rather than naming one: ${one.holds}`,
            })),

            ...findUnknownClasses(source).map((unknown) => ({
                check: "class" as const,
                message: `${unknown.file}: styles.${unknown.name} is read and its module never declared it.`,
            })),

            ...findSplitVocabulary(plugins)
                .filter((split) => split.apart.length > 0 && !(checking.apart ?? []).includes(split.name))
                .map((split) => ({
                    check: "split" as const,
                    message: `${split.plugins.join(" and ")} each declare an enum named "${split.name}", and the two no longer agree on what it may be: both hold ${split.shared.join(", ")}, and ${split.apart.join(", ")} sits in one alone. ${split.files.join(", ")}. One of them refuses a payload the other sends. Let one declare it and the other reach for it, or name them apart. If they are genuinely two ideas, name it in "apart".`,
                })),

            ...findSharedNames(plugins)
                .filter((shared) => !(checking.sharing ?? []).includes(shared.signature))
                .map((shared) => ({
                    check: "twice" as const,
                    message: `${String(shared.plugins.length)} plugins each write "${shared.signature}": ${shared.files.join(", ")}. A util a second plugin asks for belongs in src/utils, where one answer serves both. If the two answer different questions, say so in the signature, or name it in "sharing".`,
                })),

            ...findSharedVocabulary(plugins)
                .filter((shared) => !(checking.sharing ?? []).includes(shared.signature))
                .map((shared) => ({
                    check: "twice" as const,
                    message: `${String(shared.plugins.length)} plugins each declare "${shared.signature}": ${shared.files.join(", ")}. One of them owns the concept and the others read it from there, or the day a member is added only one of the copies learns. A copy that cannot import — a bundle built on its own — names itself in "sharing".`,
                })),

            ...findShadowedExports(plugins)
                .filter((shadow) => !(checking.shadowing ?? []).includes(shadow.file))
                .map((shadow) => ({
                    check: "shadowed" as const,
                    message: `${shadow.file} is written here, and "${shadow.owner}" exports ${shadow.component} already. This plugin depends on it, so the export is reachable: import it instead. A copy made from what one screen needed arrives without whatever the original grew since, and nothing says so. If the two are meant to differ, name it in "shadowing".`,
                })),

            ...findDanglingPaths(root).map((one) => ({
                check: "dangling" as const,
                message: `${one.file} resolves "${one.alias}" to ${one.target}, and nothing is there. Nothing says so until the first import of it, and then it reads as a missing module rather than a path written ahead of its file.`,
            })),

            ...overBudget(root, checking.budgets ?? {}),

            ...documents(root, checking),
        ];
    },

    /** Every check that could not run, and what it would have read. */
    findSkipped: (checking: ProjectCheckOptions = {}): ProjectSkipped[] =>
    {
        const root = checking.root ?? process.cwd();
        const docsFolder = checking.docs ?? join(root, "#docs");

        const source = join(root, "src");

        return [
            ...(existsSync(docsFolder) ? [] : [{
                check: "documents",
                message: `${docsFolder.replace(`${root}/`, "")} is not on disk, so no size was measured and no required document was looked for. Unpack them, or say where they are.`,
            }]),

            ...unmeasured(source, checking.styleIn),
            ...unwatched(source),
            ...unreachable(root, checking.across ?? []),
            ...unbuilt(root, checking.budgets ?? {}),
        ];
    },
};

function documents(root: string, checking: ProjectCheckOptions): ProjectProblem[]
{
    const docsFolder = checking.docs ?? join(root, "#docs");
    const required = checking.required ?? [];

    if (!existsSync(docsFolder))
    {
        return [];
    }

    return [
        ...findOversizedDocs(docsFolder, checking.limit).map((doc) => ({
            check: "oversized" as const,
            message: `${doc.path.replace(`${root}/`, "")} is ${String(doc.size)} characters, past the size a document keeps its point at.`,
        })),

        ...findMissingDocs(root, required).map((path) => ({
            check: "missing" as const,
            message: `${path} is absent or says nothing, and every application is asked for it.`,
        })),
    ];
}


function weighs(at: string): number
{
    return gzipSync(readFileSync(at), { level: 9 }).length;
}

function overBudget(root: string, budgets: Readonly<Record<string, number>>): ProjectProblem[]
{
    return Object.entries(budgets)
        .map(([path, allowed]) => ({ path, allowed, at: join(root, path) }))
        .filter((one) => existsSync(one.at))
        .map((one) => ({ ...one, carried: weighs(one.at) }))
        .filter((one) => one.carried > one.allowed)
        .map((one) => ({
            check: "budget" as const,
            message: `${one.path} is ${String(one.carried)} bytes gzipped, over the ${String(one.allowed)} this project promises. Move work out of it rather than raising the number: whoever quoted it is quoting what a visitor downloads.`,
        }));
}

function unbuilt(root: string, budgets: Readonly<Record<string, number>>): ProjectSkipped[]
{
    const missing = Object.keys(budgets).filter((path) => !existsSync(join(root, path)));

    return missing.length === 0 ? [] : [{
        check: "budget",
        message: `${missing.join(", ")} ${missing.length === 1 ? "is" : "are"} not built, so nothing weighed ${missing.length === 1 ? "it" : "them"}. Build before checking, or a budget nobody measured reads exactly like one that held.`,
    }];
}

function unmeasured(source: string, styleIn: readonly string[] | undefined): ProjectSkipped[]
{
    const holding = findUnmeasured(source, styleIn);

    if (holding.length === 0)
    {
        return [];
    }

    const byFolder = new Map<string, number>();

    for (const each of holding)
    {
        const folder = each.file.split("/").slice(0, -1).join("/");

        byFolder.set(folder, (byFolder.get(folder) ?? 0) + each.holds);
    }

    const worst = [...byFolder.entries()]
        .sort((first, second) => second[1] - first[1])
        .slice(0, 3)
        .map(([folder, holds]) => `${folder} (${String(holds)})`);

    return [{
        check: "literal",
        message: `The literal rule reads stylesheets, and ${String(holding.length)} other files carry a colour, length or duration that nothing measured. Most of it sits in ${worst.join(", ")}. Where that is style rather than a measurement mentioned in passing, name the folder in styleIn and it comes under the rule.`,
    }];
}

function unwatched(source: string): ProjectSkipped[]
{
    const missing = findUnwatched(source);

    if (missing.length === 0)
    {
        return [];
    }

    return [{
        check: "wiring",
        message: `A field nothing reads is looked for in exported types alone, and ${String(missing.length)} shapes here are not exported, so their fields went unread by this run. That is on purpose — a private shape is the file's own business — but a green report says nothing about them either way.`,
    }];
}

function unreachable(root: string, across: readonly string[]): ProjectSkipped[]
{
    const missing = across.filter((at) => !existsSync(join(root, at)));

    if (missing.length === 0)
    {
        return [];
    }

    return [{
        check: "across",
        message: `${missing.join(", ")} ${missing.length === 1 ? "is" : "are"} not on disk, so whatever compares this side against it compared nothing and still passed. One vocabulary held twice drifts the day nobody is looking, and a guard that cannot reach the other half reports agreement it never measured.`,
    }];
}
