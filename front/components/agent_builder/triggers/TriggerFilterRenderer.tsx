import type { LogicalOp, MatcherExpression, Operation } from "@app/lib/matcher";
import {
  isLogicalExpression,
  isOperationExpression,
  parseMatcherExpression,
} from "@app/lib/matcher";
import { Chip, ContentMessage, cn } from "@dust-tt/sparkle";
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";

const OPERATION_LABELS: Record<
  Operation | LogicalOp,
  MessageDescriptor | string
> = {
  "starts-with": msg({ message: "Starts with", context: "filter operator" }),
  contains: msg({ message: "Contains", context: "filter operator" }),
  has: msg({ message: "Has", context: "filter operator" }),
  "has-all": msg({ message: "Has all", context: "filter operator" }),
  "has-any": msg({ message: "Has any", context: "filter operator" }),
  eq: "=",
  gt: ">",
  gte: "≥",
  lt: "<",
  lte: "≤",
  exists: msg({ message: "Exists", context: "filter operator" }),
  and: msg({ message: "And", context: "filter operator" }),
  or: msg({ message: "Or", context: "filter operator" }),
  not: msg({ message: "Not", context: "filter operator" }),
};

interface TriggerFilterRendererProps {
  data: string | undefined;
}

type Translate = (descriptor: MessageDescriptor) => string;

interface OperationChipOptions {
  name: string;
  color: "success" | "info" | "warning" | "primary";
}

function getOperationChipOptions(
  op: LogicalOp | Operation,
  t: Translate
): OperationChipOptions {
  let color: "success" | "info" | "warning" | "primary";
  switch (op) {
    case "and":
      color = "success";
      break;
    case "or":
      color = "info";
      break;
    case "not":
      color = "warning";
      break;
    default:
      color = "primary";
  }
  const label = OPERATION_LABELS[op];
  return { name: typeof label === "string" ? label : t(label), color };
}

interface OperationChipProps {
  op: LogicalOp | Operation;
  className?: string;
}

function OperationChip({ op, className }: OperationChipProps) {
  const { t } = useLingui();
  const { color, name } = getOperationChipOptions(op, t);
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
          <Trans>Expression too deeply nested (depth &gt; 4)</Trans>
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

  const parseResult = parseMatcherExpression(data);

  if (parseResult.isErr()) {
    const errorMessage = parseResult.error.message;
    return (
      <ContentMessage variant="warning" size="lg">
        <Trans>
          Error parsing filter expression: {errorMessage}. Please check the
          filter syntax.
        </Trans>
      </ContentMessage>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border px-4 py-4">
      <div className="max-w-full overflow-x-auto text-sm">
        <ExpressionNode expression={parseResult.value} />
      </div>
    </div>
  );
}
