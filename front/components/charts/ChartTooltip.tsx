import { cn } from "@dust-tt/sparkle";

interface LegendDotProps {
  className: string;
  rounded?: "sm" | "full";
}

export function LegendDot({ className, rounded = "sm" }: LegendDotProps) {
  return (
    <span
      aria-hidden
      role="presentation"
      className={cn(
        "inline-block h-2.5 w-2.5 bg-current",
        rounded === "full" ? "rounded-full" : "rounded-sm",
        className
      )}
    />
  );
}

interface TooltipRow {
  key?: string;
  label: string;
  value: string | number;
  colorClassName?: string;
  percent?: number | null;
}

interface ChartTooltipProps {
  title?: string;
  rows: TooltipRow[];
  footer?: string;
  activeKey?: string;
  selectedKey?: string;
  separatorAfterKey?: string;
}

export function ChartTooltipCard({
  title,
  rows,
  footer,
  activeKey,
  selectedKey,
  separatorAfterKey,
}: ChartTooltipProps) {
  const visibleRows =
    selectedKey !== undefined
      ? rows.filter((r) => (r.key ?? r.label) === selectedKey)
      : rows;

  if (visibleRows.length === 0) {
    return null;
  }

  return (
    <div
      role="tooltip"
      className="min-w-32 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl"
    >
      {title && <div className="mb-1 font-medium text-foreground">{title}</div>}
      <ul>
        {visibleRows.map((r, index) => {
          const rowKey = r.key ?? r.label;
          const isActive = rowKey === activeKey;
          const previousRow = visibleRows[index - 1];
          const previousRowKey = previousRow?.key ?? previousRow?.label;
          const hasSeparator = previousRowKey === separatorAfterKey;
          return (
            <li
              key={rowKey}
              className={cn(
                "flex items-center gap-2 rounded",
                index > 0 &&
                  (hasSeparator
                    ? "mt-1 border-t border-border/50 pt-1"
                    : "mt-1.5"),
                isActive && "-mx-1.5 bg-muted-background/60 px-1.5"
              )}
            >
              {r.colorClassName && <LegendDot className={r.colorClassName} />}
              <span
                className={cn(
                  isActive
                    ? "font-medium text-foreground"
                    : "text-muted-foreground"
                )}
              >
                {r.label}
              </span>
              <span className="ml-auto font-medium tabular-nums text-foreground">
                {r.value.toLocaleString()}
              </span>
              {typeof r.percent === "number" && (
                <span className="text-muted-foreground">({r.percent}%)</span>
              )}
            </li>
          );
        })}
      </ul>
      {footer && (
        <div className="mt-1 border-t border-border/50 pt-1 text-muted-foreground">
          {footer}
        </div>
      )}
    </div>
  );
}
