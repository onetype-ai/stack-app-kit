export { findImportViolations } from "./testing/boundaries";
export type { ImportEdge, ImportViolation } from "./testing/boundaries";

export { findMissingDocs, findOversizedDocs, findUndocumentedKeys, findUnexplainedPlugins } from "./testing/docs";
export type { OversizedDoc, UndocumentedKey } from "./testing/docs";

export { findUnusedFields } from "./testing/wiring";
export type { UnusedField } from "./testing/wiring";

export { findUnknownClasses, findUnknownTokens } from "./testing/styling";
export type { UnknownClass, UnknownToken } from "./testing/styling";
