import { join } from "node:path";

import { findImportViolations } from "./boundaries";
import { findComments, findUnexplainedPlugins } from "./docs";
import { findLiterals, findUnknownClasses, findUnknownTokens } from "./styling";
import { findUnusedFields } from "./wiring";

export type ProjectProblem = {
    check: "boundaries" | "wiring" | "unexplained" | "token" | "class" | "comment" | "literal";
    message: string;
};

export type ProjectCheckOptions = {
    root?: string;
    plugins?: string;

    /** Where pure code shared between plugins lives. */
    utils?: string;
};

/**
 * Every check an application runs on itself, in one call.
 *
 * One entry rather than six: a check added here reaches every project that
 * already calls this, instead of waiting for someone to notice it exists.
 * Two of these were missing from this repository for exactly that reason.
 */
export const Project = {
    required: ["#docs/usage.md", "#docs/stack.md", "#docs/architecture.md"] as const,

    checks: (checking: ProjectCheckOptions = {}): ProjectProblem[] =>
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

            ...findLiterals(source).map((one) => ({
                check: "literal" as const,
                message: `${one.file}:${String(one.line)} writes a ${one.kind} rather than naming one: ${one.holds}`,
            })),

            ...findUnknownClasses(source).map((unknown) => ({
                check: "class" as const,
                message: `${unknown.file}: styles.${unknown.name} is read and its module never declared it.`,
            })),

        ];
    },
};
