// Main exports for payload matching functionality.

// Export types.
export type {
  MatcherExpression,
  Operation,
  LogicalOp,
  OperationExpression,
  LogicalExpression,
} from "./types";

// Export type guards.
export { isLogicalExpression, isOperationExpression } from "./types";

// Export parser.
export { parseMatcherExpression } from "./parser";

// Export matcher.
export { matchPayload } from "./matcher";
