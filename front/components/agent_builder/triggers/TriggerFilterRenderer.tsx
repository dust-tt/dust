import { Chip, cn } from "@dust-tt/sparkle";
import React from "react";

import type { LogicalOp, MatcherExpression, Operation } from "@app/lib/matcher";
import {
  isLogicalExpression,
  isOperationExpression,
  parseMatcherExpression,
} from "@app/lib/matcher";
import { OperationDisplayNames } from "@app/lib/matcher/types";

interface TriggerFilterRendererProps {
  data: string | undefined;
}

interface OperationChipOptions {
  name: string;
  color: "green" | "golden" | "warning" | "primary";
}

function getOperationChipOptions(
  op: LogicalOp | Operation
): OperationChipOptions {
  let color: "green" | "golden" | "warning" | "primary";
  switch (op) {
    case "and":
      color = "green";
      break;
    case "or":
      color = "golden";
      break;
    case "not":
      color = "warning";
      break;
    default:
      color = "primary";
  }
  return { name: OperationDisplayNames[op].toUpperCase(), color };
}

interface OperationChipProps {
  op: LogicalOp | Operation;
  className?: string;
}

function OperationChip({ op, className }: OperationChipProps) {
  const { color, name } = getOperationChipOptions(op);
  return (
    <Chip className={cn(className)} color={color} size="xs">
      {name}
    </Chip>
  );
}

interface ExpressionNodeProps {
  expression: MatcherExpression;
  depth?: number;
}

// Recursive component to render a single expression from a matcher tree structure. The depth limit
// of 4 prevents excessive nesting that could cause performance issues or UI rendering problems.
function ExpressionNode({ expression, depth = 0 }: ExpressionNodeProps) {
  if (depth > 4) {
    return (
      <>
        <p className="mb-1 text-xs font-semibold">
          Expression too deeply nested (depth &gt; 4)
        </p>
        <pre className="overflow-x-auto text-xs">
          {JSON.stringify(expression, null, 2)}
        </pre>
      </>
    );
  }

  if (isLogicalExpression(expression)) {
    switch (expression.op) {
      case "not":
        return (
          <div className="itemcenter flex flex-wrap gap-2">
            <OperationChip op={expression.op} />
            <div className="flex-1">
              <ExpressionNode
                expression={expression.expressions[0]}
                depth={depth}
              />
            </div>
          </div>
        );
      default:
        return (
          <div className="flex flex-col gap-2">
            <div className="itemcenter flex gap-2">
              <OperationChip op={expression.op} />
            </div>
            <div
              className={
                "border-element-500 ml-4 flex flex-col gap-2 border-l-2 pl-4"
              }
            >
              {expression.expressions.map((subExpr, index) => (
                <ExpressionNode
                  key={index}
                  expression={subExpr}
                  depth={depth + 1}
                />
              ))}
            </div>
          </div>
        );
    }
  }

  // Render operation expressions.
  if (isOperationExpression(expression)) {
    switch (expression.op) {
      case "exists":
        return (
          <div className="itemcenter flex flex-wrap gap-2">
            <OperationChip op={expression.op} />
            <code className="px-2 py-1">{expression.field}</code>
          </div>
        );
      default:
        return (
          <div className="itemcenter flex flex-wrap gap-2">
            <code className="px-2 py-1">{expression.field}</code>
            <OperationChip op={expression.op} />
            <div className="itemcenter flex flex-wrap gap-1">
              {expression.value !== undefined && (
                <code className="py-1">
                  {typeof expression.value === "string"
                    ? `"${expression.value}"`
                    : String(expression.value)}
                </code>
              )}

              {expression.values &&
                expression.values.map((value, index) => (
                  <code key={index} className="py-1">
                    {typeof value === "string" ? `"${value}"` : String(value)}
                  </code>
                ))}
            </div>
          </div>
        );
    }
  }
}

export function TriggerFilterRenderer({ data }: TriggerFilterRendererProps) {
  if (!data) {
    return null;
  }

  try {
    const parsedData = parseMatcherExpression(data);

    return (
      <div className={"overflow-hidden px-4 py-4"}>
        <div className="max-w-full overflow-x-auto text-sm">
          <ExpressionNode expression={parsedData} />
        </div>
      </div>
    );
  } catch (error) {
    const errorMessage =
      error instanceof Error &&
      "message" in error &&
      typeof error.message === "string"
        ? error.message
        : "unknown error";
    return (
      <div className="overflow-hidden px-4 py-4">
        <p className="text-sm text-warning">
          Error parsing filter expression: {errorMessage}. Please check the
          filter syntax.
        </p>
      </div>
    );
  }
}
