import { existsSync, readFileSync, readdirSync } from "node:fs";
import type { Dirent } from "node:fs";
import { basename, join } from "node:path";
import { gzipSync } from "node:zlib";

function entriesOf(folder: string, recursive = false): Dirent[]
{
    if (!existsSync(folder))
    {
        return [];
    }

    return readdirSync(folder, { withFileTypes: true, recursive });
}


import { findImportViolations, findShadowedExports, findSharedNames, findSharedVocabulary, findSplitVocabulary } from "./boundaries";
import { findComments, findMissingDocs, findOversizedDocs, findUndocumentedKeys, findUnexplainedPlugins } from "./docs";
import { findLiterals, findUnknownClasses, findUnknownTokens, findUnmeasured } from "./styling";
import { findDanglingPaths, findEntryReach, findUnusedFields, findUnwatched } from "./wiring";

/** One thing a run found wrong, tagged with the check that found it and phrased for a reader. */
export type ProjectProblem = {
    check: "boundaries" | "wiring" | "unexplained" | "token" | "class" | "comment" | "literal" | "oversized" | "missing" | "dangling" | "twice" | "budget" | "split" | "shadowed" | "reach" | "undocumented" | "unfinished" | "size" | "tests" | "slow";
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

    /** Documents this application asks itself to hold; none unless named. `Project.required` is the kit's suggestion. */
    required?: readonly string[];

    /** Refuses what 6.x only warns about (a plugin's usage.md past its size); the default from 7.0. */
    strict?: boolean;

    /** Lines a source file may reach before it warns (500): past it, one file holds more than one idea. */
    maxLines?: number;

    /** A plugin's test lines as a share of its production lines before it warns (0.1): past it, tests re-prove what they already proved. */
    maxTestRatio?: number;

    /** A vitest JSON report (`--reporter=json --outputFile=...`); a test file taking over `maxTestShare` of the suite's time warns. */
    testReport?: string;
    maxTestShare?: number;

    /** The size a document may reach before it has outgrown its point. */
    maxCharacters?: number;

    /** The published type declaring `Definition`, read to list the keys a plugin may declare. */
    contract?: string;

    /** Documents a worked example fills, each named, and the ceiling they are still held to. */
    worked?: readonly string[];
    workedMaxCharacters?: number;

    /** Where style lives outside a stylesheet, as paths under `src`. */
    styleIn?: readonly string[];

    /** Signatures two plugins may each keep, because they answer different questions. */
    sharing?: readonly string[];

    /** Components a plugin writes for itself although one it depends on exports the same name. */
    shadowing?: readonly string[];

    /** Enum names two plugins may each declare, where the two are not one idea. */
    separateEnums?: readonly string[];

    /** Where the other half of this application lives, when it has one. */
    otherStacks?: readonly string[];

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

            ...(checking.strict === true ? oversizedUsage(root, plugins, checking.maxCharacters) : []),

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
                .filter((split) => split.disagreed.length > 0 && !(checking.separateEnums ?? []).includes(split.name))
                .map((split) => ({
                    check: "split" as const,
                    message: `${split.plugins.join(" and ")} each declare an enum named "${split.name}", and the two no longer agree on what it may be: both hold ${split.shared.join(", ")}, and ${split.disagreed.join(", ")} sits in one alone. ${split.files.join(", ")}. One of them refuses a payload the other sends. Let one declare it and the other reach for it, or name them apart. If they are genuinely two ideas, name it in "separateEnums".`,
                })),

            ...findSharedNames(plugins)
                .filter((shared) => !(checking.sharing ?? []).includes(shared.signature))
                .map((shared) => ({
                    check: "twice" as const,
                    message: `${String(shared.plugins.length)} plugins each write "${shared.signature}": ${shared.files.join(", ")}. A util a second plugin asks for belongs in src/utils, where one answer serves both. If the two answer different questions, log so in the signature, or name it in "sharing".`,
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

            ...findEntryReach(root).map((one) => ({
                check: "reach" as const,
                message: `${one.file} imports through "${one.alias}", which belongs to a plugin. A root that names one stops being a root: removing that plugin then breaks the boot rather than removing a capability.`,
            })),

            ...overBudget(root, checking.budgets ?? {}),

            ...documents(root, checking),
        ];
    },

    /** What 6.x reports without failing: each becomes a refusal in `findAll` with `strict: true`, the default from 7.0. */
    findWarnings: (checking: ProjectCheckOptions = {}): ProjectProblem[] =>
    {
        const root = checking.root ?? process.cwd();
        const plugins = checking.plugins ?? join(root, "src", "plugins");

        return [
            ...(checking.strict === true ? [] : oversizedUsage(root, plugins, checking.maxCharacters)),
            ...unfinished(root, plugins),
            ...oversizedFiles(root, plugins, checking.maxLines ?? 500),
            ...heavyTests(root, plugins, checking.maxTestRatio ?? 0.1),
            ...slowTests(root, checking.testReport, checking.maxTestShare ?? 0.1),
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
                message: `${docsFolder.replace(`${root}/`, "")} is not on disk, so no size was measured and no required document was looked for. Unpack them, or log where they are.`,
            }]),

            ...unmeasured(source, checking.styleIn),
            ...unwatched(source),
            ...unreachable(root, checking.otherStacks ?? []),
            ...unbuilt(root, checking.budgets ?? {}),
        ];
    },
};

function linesOf(file: string): number
{
    return readFileSync(file, "utf8").split("\n").length;
}

function sourcesOf(folder: string): { file: string; isTest: boolean }[]
{
    return entriesOf(folder, true)
        .filter((entry) => entry.isFile() && /\.tsx?$/.test(entry.name))
        .map((entry) =>
        {
            const file = join(entry.parentPath, entry.name);

            return { file, isTest: /\.test\.tsx?$/.test(entry.name) || file.includes("/tests/") };
        });
}

function oversizedFiles(root: string, plugins: string, maxLines: number): ProjectProblem[]
{
    return sourcesOf(plugins)
        .filter(({ isTest }) => !isTest)
        .map(({ file }) => ({ file, lines: linesOf(file) }))
        .filter(({ lines }) => lines > maxLines)
        .map(({ file, lines }) => ({
            check: "size" as const,
            message: `${file.replace(`${root}/`, "")} is ${lines} lines, past ${maxLines}: split it by the ideas it holds.`,
        }));
}

function heavyTests(root: string, plugins: string, maxRatio: number): ProjectProblem[]
{
    return entriesOf(plugins)
        .filter((entry) => entry.isDirectory())
        .map((entry) =>
        {
            const sources = sourcesOf(join(plugins, entry.name));
            const count = (isTest: boolean): number => sources.filter((source) => source.isTest === isTest).reduce((sum, source) => sum + linesOf(source.file), 0);

            return { name: entry.name, production: count(false), tests: count(true) };
        })
        .filter(({ production, tests }) => production > 0 && tests / production > maxRatio)
        .map(({ name, production, tests }) => ({
            check: "tests" as const,
            message: `${name} holds ${tests} test lines for ${production} lines of code, past ${Math.round(maxRatio * 100)}%: prove each guarantee once, through the public entry.`,
        }));
}

function slowTests(root: string, report: string | undefined, maxShare: number): ProjectProblem[]
{
    if (report === undefined || !existsSync(report))
    {
        return [];
    }

    const read = JSON.parse(readFileSync(report, "utf8")) as { testResults?: { name?: string; startTime?: number; endTime?: number }[] };
    const files = (read.testResults ?? []).map((result) => ({ name: result.name ?? "", ms: (result.endTime ?? 0) - (result.startTime ?? 0) }));
    const total = files.reduce((sum, file) => sum + file.ms, 0);

    return files
        .filter((file) => total > 0 && file.ms / total > maxShare)
        .map((file) => ({
            check: "slow" as const,
            message: `${file.name.replace(`${root}/`, "")} takes ${Math.round((file.ms / total) * 100)}% of the suite's time, past ${Math.round(maxShare * 100)}%: fake its clock or its world, or tag it slow.`,
        }));
}

function unfinished(root: string, plugins: string): ProjectProblem[]
{
    if (!existsSync(plugins))
    {
        return [];
    }

    return readdirSync(plugins, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .flatMap((entry) => ["plugin.ts", "usage.md"].map((file) => join(plugins, entry.name, file)))
        .filter((file) => existsSync(file) && readFileSync(file, "utf8").includes("TODO:"))
        .map((file) => ({
            check: "unfinished" as const,
            message: `${file.replace(`${root}/`, "")} still holds a TODO: the generator's placeholder, or a note nobody finished.`,
        }));
}

function oversizedUsage(root: string, plugins: string, maxCharacters: number | undefined): ProjectProblem[]
{
    return findOversizedDocs(plugins, maxCharacters)
        .filter((doc) => basename(doc.path) === "usage.md")
        .map((doc) => ({
            check: "oversized" as const,
            message: `${doc.path.replace(`${root}/`, "")} is ${String(doc.size)} characters, past the size another author reads whole. Cut it to what a caller needs.`,
        }));
}

function everyDocument(folder: string): string
{
    if (!existsSync(folder))
    {
        return "";
    }

    return entriesOf(folder, true)
        .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
        .map((entry) => readFileSync(join(entry.parentPath, entry.name), "utf8"))
        .join("\n");
}

function documents(root: string, checking: ProjectCheckOptions): ProjectProblem[]
{
    const docsFolder = checking.docs ?? join(root, "#docs");
    const required = checking.required ?? [];

    if (!existsSync(docsFolder))
    {
        return [];
    }

    return [
        ...findOversizedDocs(docsFolder, checking.maxCharacters)
            .filter((doc) => !(checking.worked ?? []).some((name) => doc.path.endsWith(name)))
            .map((doc) => ({
                check: "oversized" as const,
                message: `${doc.path.replace(`${root}/`, "")} is ${String(doc.size)} characters, past the size a document keeps its point at.`,
            })),

        ...((checking.worked ?? []).length === 0
            ? []
            : findOversizedDocs(docsFolder, checking.workedMaxCharacters ?? 3000)
                .filter((doc) => (checking.worked ?? []).some((name) => doc.path.endsWith(name)))
                .map((doc) => ({
                    check: "oversized" as const,
                    message: `${doc.path.replace(`${root}/`, "")} is ${String(doc.size)} characters. A worked example may run long; this one has run past even that.`,
                }))),

        ...findMissingDocs(root, required).map((path) => ({
            check: "missing" as const,
            message: `${path} is absent or says nothing, and every application is asked for it.`,
        })),

        ...(checking.contract === undefined
            ? []
            : findUndocumentedKeys(checking.contract, everyDocument(docsFolder)).map((key: string) => ({
                check: "undocumented" as const,
                message: `\`${key}\` is a key a contract accepts, and no document writes it. An author reading these never learns it exists.`,
            }))),
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
        .filter((budget) => existsSync(budget.at))
        .map((budget) => ({ ...budget, gzipped: weighs(budget.at) }))
        .filter((budget) => budget.gzipped > budget.allowed)
        .map((budget) => ({
            check: "budget" as const,
            message: `${budget.path} is ${String(budget.gzipped)} bytes gzipped, over the ${String(budget.allowed)} this project promises. Move work out of it rather than raising the number: whoever quoted it is quoting what a visitor downloads.`,
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

function unreachable(root: string, otherStacks: readonly string[]): ProjectSkipped[]
{
    const missing = otherStacks.filter((at) => !existsSync(join(root, at)));

    if (missing.length === 0)
    {
        return [];
    }

    return [{
        check: "across",
        message: `${missing.join(", ")} ${missing.length === 1 ? "is" : "are"} not on disk, so whatever compares this side against it compared nothing and still passed. One vocabulary held twice drifts the day nobody is looking, and a guard that cannot reach the other half reports agreement it never measured.`,
    }];
}
