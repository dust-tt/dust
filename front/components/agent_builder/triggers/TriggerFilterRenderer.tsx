import React from "react";

import { Chip, cn } from "@dust-tt/sparkle";
import type { MatcherExpression } from "@app/lib/webhooks/payload_matcher";
import {
  isLogicalExpression,
  isOperationExpression,
  parseMatcherExpression,
} from "@app/lib/webhooks/payload_matcher";

interface TriggerFilterRendererProps {
  data: string | undefined;
}

// Recursive component to render a single expression.
function ExpressionNode({
  expression,
  depth = 0,
}: {
  expression: MatcherExpression;
  depth?: number;
}) {
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
            <Chip color="warning" size="xs">
              NOT
            </Chip>
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
              <Chip
                color={expression.op === "and" ? "green" : "golden"}
                size="xs"
              >
                {expression.op.toUpperCase()}
              </Chip>
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
    // For exists operator (unary).
    if (expression.op === "exists") {
      return (
        <div className="itemcenter flex flex-wrap gap-2">
          <Chip color="primary" size="xs">
            EXISTS
          </Chip>
          <code className="px-2 py-1">{expression.field}</code>
        </div>
      );
    }

    return (
      <div className="itemcenter flex flex-wrap gap-2">
        <code className="px-2 py-1">{expression.field}</code>
        <Chip color="primary" size="xs">
          {expression.op.toUpperCase()}
        </Chip>
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

export function TriggerFilterRenderer({ data }: TriggerFilterRendererProps) {
  if (!data) {
    return null;
  }

  const parsedData = parseMatcherExpression(data);

  return (
    <div className={"overflow-hidden px-4 py-4"}>
      <div className="max-w-full overflow-x-auto text-sm">
        <ExpressionNode expression={parsedData} />
      </div>
    </div>
  );
}
