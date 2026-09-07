export { findImportViolations } from "./testing/boundaries";
export type { ImportEdge, ImportViolation } from "./testing/boundaries";

export { findComments, findMissingDocs, findOversizedDocs, findPrivateComments, findUndocumentedKeys, findUnexplainedPlugins } from "./testing/docs";
export type { Commented, OversizedDoc, PrivateComment, UndocumentedKey } from "./testing/docs";

export { findUnusedFields } from "./testing/wiring";
export type { UnusedField } from "./testing/wiring";

export { findLiterals, findUnknownClasses, findUnknownTokens } from "./testing/styling";
export type { UnknownClass, UnknownToken } from "./testing/styling";

export { fakeContext } from "./testing/context";
export type { Announced, Answered, Answers, Asked, Commanded, Fake, Faking } from "./testing/context";

export { Project } from "./testing/project";
export type { ProjectCheckOptions, ProjectProblem } from "./testing/project";
