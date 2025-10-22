import { cn } from "@dust-tt/sparkle";

interface LegendDotProps {
  className: string;
}

export function LegendDot({ className }: LegendDotProps) {
  return (
    <span
      aria-hidden
      role="presentation"
      className={cn(
        "inline-block h-2.5 w-2.5 rounded-sm bg-current",
        className
      )}
    />
  );
}

interface TooltipRow {
  label: string;
  value: string | number;
  colorClassName?: string;
  percent?: number | null;
}

interface ChartTooltipProps {
  title?: string;
  rows: TooltipRow[];
  footer?: string;
}

export function ChartTooltipCard({ title, rows, footer }: ChartTooltipProps) {
  return (
    <div
      role="tooltip"
      className="min-w-32 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl"
    >
      {title && <div className="mb-1 font-medium text-foreground">{title}</div>}
      <ul className="space-y-1.5">
        {rows.map((r) => (
          <li key={r.label} className="flex items-center gap-2">
            {r.colorClassName && <LegendDot className={r.colorClassName} />}
            <span className="text-muted-foreground">{r.label}</span>
            <span className="ml-auto font-mono font-medium tabular-nums text-foreground">
              {r.value}
            </span>
            {typeof r.percent === "number" && (
              <span className="text-muted-foreground">({r.percent}%)</span>
            )}
          </li>
        ))}
      </ul>
      {footer && (
        <div className="mt-1 border-t border-border/50 pt-1 text-muted-foreground">
          {footer}
        </div>
      )}
    </div>
  );
}
