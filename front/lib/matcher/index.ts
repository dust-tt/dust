// Main exports for payload matching functionality.

// Export matcher.
export { matchPayload } from "./matcher";
// Export parser.
export { parseMatcherExpression } from "./parser";
// Export types.
export type {
  LogicalExpression,
  LogicalOp,
  MatcherExpression,
  Operation,
  OperationExpression,
} from "./types";
// Export type guards.
export { isLogicalExpression, isOperationExpression } from "./types";
