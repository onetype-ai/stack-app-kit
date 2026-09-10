export { findImportViolations, findShadowedExports, findSharedNames, findSharedVocabulary, findSplitVocabulary } from "./testing/boundaries";
export type { ImportEdge, ImportViolation, DuplicateSignature, ShadowedExport, SplitVocabulary } from "./testing/boundaries";

export { findComments, findMissingDocs, findOversizedDocs, findPrivateComments, findUndocumentedKeys, findUnexplainedPlugins } from "./testing/docs";
export type { Commented, OversizedDoc, PrivateComment, UndocumentedKey } from "./testing/docs";

export { findDanglingPaths, findUnusedFields, findUnwatched } from "./testing/wiring";
export type { DanglingPath, UnusedField, Unwatched } from "./testing/wiring";

export { findLiterals, findUnmeasured, findUnknownClasses, findUnknownTokens } from "./testing/styling";
export type { UnknownClass, UnknownToken, Unmeasured } from "./testing/styling";

export { fakeContext } from "./testing/context";
export type { EmittedEvent, FakeResponse, Answers, FakeRequest, RanCommand, Fake, Faking } from "./testing/context";

export { Project } from "./testing/project";
export type { ProjectCheckOptions, ProjectProblem, ProjectSkipped } from "./testing/project";
