import { existsSync } from "node:fs";
import { join } from "node:path";

import { findImportViolations } from "./boundaries";
import { findMissingDocs, findOversizedDocs, findUnexplainedPlugins } from "./docs";
import { findUnknownClasses, findUnknownTokens } from "./styling";
import { findUnusedFields } from "./wiring";

export type ProjectProblem = {
    check: "boundaries" | "wiring" | "oversized" | "missing" | "unexplained" | "token" | "class";
    message: string;
};

export type ProjectCheckOptions = {
    root?: string;
    plugins?: string;
    docs?: string;
    required?: readonly string[];
    limit?: number;
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
        const docs = checking.docs ?? join(root, "#docs");
        const source = join(root, "src");

        // The structural checks read code and run always. The document ones
        // read #docs, which a project may have packed into one file: a packed
        // project is not an unchecked one, so their absence skips them.
        const written = existsSync(docs);

        return [
            ...findImportViolations(plugins).map((wrong) => ({ check: "boundaries" as const, message: wrong.message })),

            ...findUnusedFields(plugins).map((unread) => ({
                check: "wiring" as const,
                message: `${unread.file}: ${unread.shape}.${unread.field} is declared and nothing reads it.`,
            })),

            ...findUnexplainedPlugins(plugins).map((name) => ({
                check: "unexplained" as const,
                message: `"${name}" has no usage.md. A plugin nobody can read is one nobody can depend on.`,
            })),

            ...findUnknownTokens(source).map((unknown) => ({
                check: "token" as const,
                message: `${unknown.file}: var(${unknown.token}) is asked for and nothing declares it.`,
            })),

            ...findUnknownClasses(source).map((unknown) => ({
                check: "class" as const,
                message: `${unknown.file}: styles.${unknown.name} is read and its module never declared it.`,
            })),

            ...(written
                ? [
                    ...findOversizedDocs(docs, checking.limit).map((doc) => ({
                        check: "oversized" as const,
                        message: `${doc.path.replace(`${root}/`, "")} is ${String(doc.size)} characters, over the limit.`,
                    })),
                    ...findMissingDocs(root, checking.required ?? Project.required).map((path) => ({
                        check: "missing" as const,
                        message: `${path} is absent or says nothing.`,
                    })),
                ]
                : []),
        ];
    },
};
