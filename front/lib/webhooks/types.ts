// Type definitions for matcher expressions.

const Operations = [
  "eq",
  "starts-with",
  "has",
  "has-all",
  "has-any",
  "gt",
  "gte",
  "lt",
  "lte",
  "exists",
] as const;
export type Operation = (typeof Operations)[number];

export const LogicalOps = ["and", "or", "not"] as const;
export type LogicalOp = (typeof LogicalOps)[number];

export type OperationExpression = {
  op: Operation;
  field: string;
  value?: unknown;
  values?: unknown[];
};

export type LogicalExpression = {
  op: LogicalOp;
  expressions: MatcherExpression[];
};

export type MatcherExpression = OperationExpression | LogicalExpression;

// Type guard functions.
export function isLogicalExpression(
  expr: MatcherExpression
): expr is LogicalExpression {
  return "expressions" in expr;
}

export function isOperationExpression(
  expr: MatcherExpression
): expr is OperationExpression {
  return "field" in expr;
}

export function isUnaryOperation(
  op: Operation | LogicalOp
): op is "exists" | "not" {
  return op === "exists" || op === "not";
}

export function isBinaryOperation(op: Operation | LogicalOp): boolean {
  return (
    op === "eq" ||
    op === "starts-with" ||
    op === "has" ||
    op === "gt" ||
    op === "gte" ||
    op === "lt" ||
    op === "lte" ||
    op === "has-all" ||
    op === "has-any"
  );
}

export function isVariadicOperation(
  op: Operation | LogicalOp
): op is "and" | "or" {
  return op === "and" || op === "or";
}

export function isOperator(op: unknown): op is Operation | LogicalOp {
  return (
    typeof op === "string" &&
    ([...Operations, ...LogicalOps] as readonly string[]).includes(op)
  );
}
