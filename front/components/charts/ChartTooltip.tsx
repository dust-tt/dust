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
}

export function ChartTooltipCard({
  title,
  rows,
  footer,
  activeKey,
  selectedKey,
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
      className="min-w-32 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl dark:border-border-night/50 dark:bg-background-night"
    >
      {title && (
        <div className="mb-1 font-medium text-foreground dark:text-foreground-night">
          {title}
        </div>
      )}
      <ul className="space-y-1.5">
        {visibleRows.map((r) => {
          const rowKey = r.key ?? r.label;
          const isActive = rowKey === activeKey;
          return (
            <li
              key={rowKey}
              className={cn(
                "flex items-center gap-2 rounded",
                isActive &&
                  "-mx-1.5 bg-muted-background/60 px-1.5 dark:bg-muted-background-night/60"
              )}
            >
              {r.colorClassName && <LegendDot className={r.colorClassName} />}
              <span
                className={cn(
                  isActive
                    ? "font-medium text-foreground dark:text-foreground-night"
                    : "text-muted-foreground dark:text-muted-foreground-night"
                )}
              >
                {r.label}
              </span>
              <span className="ml-auto font-mono font-medium tabular-nums text-foreground dark:text-foreground-night">
                {r.value.toLocaleString()}
              </span>
              {typeof r.percent === "number" && (
                <span className="text-muted-foreground dark:text-muted-foreground-night">
                  ({r.percent}%)
                </span>
              )}
            </li>
          );
        })}
      </ul>
      {footer && (
        <div className="mt-1 border-t border-border/50 pt-1 text-muted-foreground dark:border-border-night/50 dark:text-muted-foreground-night">
          {footer}
        </div>
      )}
    </div>
  );
}
