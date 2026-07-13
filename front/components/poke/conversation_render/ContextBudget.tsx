import type { PostRenderConversationResponseBody } from "@app/types/api/poke/conversation_render";
import { cn } from "@dust-tt/sparkle";

type TokenCategory = {
  className: string;
  description: string;
  label: string;
  tokens: number;
};

export function formatTokens(tokens: number): string {
  return tokens.toLocaleString();
}

export function percentage(value: number, total: number): number {
  if (total <= 0) {
    return 0;
  }
  return Math.min((value / total) * 100, 100);
}

export function TokenSummaryCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-xl border border-separator bg-background p-4 shadow-sm">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 font-mono text-2xl font-semibold tabular-nums text-foreground">
        {value}
      </div>
      <div className="mt-1 text-xs text-muted-foreground">{detail}</div>
    </div>
  );
}

export function ContextBudget({
  result,
}: {
  result: PostRenderConversationResponseBody;
}) {
  const { tokenCounts } = result.diagnostics;
  const categories: TokenCategory[] = [
    {
      className: "bg-highlight-500",
      description: "System instructions and injected context",
      label: "System prompt",
      tokens: tokenCounts.prompt,
    },
    {
      className: "bg-info-500",
      description: "Adjusted cost used by the renderer",
      label: "Tool definitions",
      tokens: tokenCounts.toolDefinitionsAdjusted,
    },
    {
      className: "bg-success-500",
      description: "Selected user, assistant, and tool-result messages",
      label: "Conversation",
      tokens: tokenCounts.messages,
    },
    {
      className: "bg-muted-foreground",
      description: "Fixed safety buffer",
      label: "Safety margin",
      tokens: tokenCounts.safetyMargin,
    },
  ];

  return (
    <section className="rounded-xl border border-separator bg-muted-background p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">
            Input context budget
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            The exact budget calculation used during conversation rendering.
          </p>
        </div>
        <div className="text-right font-mono text-sm tabular-nums">
          <span className="font-semibold text-foreground">
            {formatTokens(tokenCounts.total)}
          </span>
          <span className="text-muted-foreground">
            {` / ${formatTokens(tokenCounts.allowed)} input tokens`}
          </span>
        </div>
      </div>

      <div
        className="mt-4 flex h-4 w-full overflow-hidden rounded-full bg-background shadow-inner"
        role="img"
        aria-label={`${formatTokens(tokenCounts.total)} of ${formatTokens(tokenCounts.allowed)} input tokens used`}
      >
        {categories.map((category) => (
          <div
            key={category.label}
            className={category.className}
            style={{
              width: `${percentage(category.tokens, tokenCounts.allowed)}%`,
            }}
            title={`${category.label}: ${formatTokens(category.tokens)} tokens`}
          />
        ))}
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2">
        {categories.map((category) => (
          <div
            key={category.label}
            className="flex items-center justify-between gap-4 rounded-lg bg-background px-3 py-2"
          >
            <div className="flex min-w-0 items-center gap-3">
              <span
                className={cn(
                  "h-2.5 w-2.5 shrink-0 rounded-full",
                  category.className
                )}
                aria-hidden="true"
              />
              <div className="min-w-0">
                <div className="text-sm font-medium text-foreground">
                  {category.label}
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {category.description}
                </div>
              </div>
            </div>
            <div className="shrink-0 text-right font-mono text-sm tabular-nums">
              <div className="text-foreground">
                {formatTokens(category.tokens)}
              </div>
              <div className="text-xs text-muted-foreground">
                {percentage(category.tokens, tokenCounts.allowed).toFixed(1)}%
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
