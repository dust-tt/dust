import { cn } from "@dust-tt/sparkle";

interface LegendDotProps {
  className: string;
}

export function LegendDot({ className }: LegendDotProps) {
  return (
    <span
      className={cn(
        "inline-block h-2.5 w-2.5 rounded-sm bg-current",
        className
      )}
    />
  );
}

export type TooltipRow = {
  label: string;
  value: string | number;
  colorClass?: string;
  percent?: number | null;
};

interface ChartTooltipProps {
  title?: string;
  rows: TooltipRow[];
  footer?: string;
}

export function ChartTooltipCard({ title, rows, footer }: ChartTooltipProps) {
  return (
    <div className="bg-card rounded-md border border-border p-3 text-foreground shadow-md">
      {title && (
        <div className="mb-2 text-xs font-medium text-muted-foreground">
          {title}
        </div>
      )}
      {rows.map((r) => (
        <div
          key={r.label}
          className="mt-1 flex items-center gap-2 text-xs first:mt-0"
        >
          {r.colorClass && <LegendDot className={r.colorClass} />}
          <span className="text-muted-foreground">{r.label}</span>
          <span className="ml-auto font-medium">{r.value}</span>
          {r.percent !== null && r.percent !== undefined && (
            <span className="text-muted-foreground">({r.percent}%)</span>
          )}
        </div>
      ))}
      {footer && (
        <div className="mt-2 border-t border-border pt-2 text-xs text-muted-foreground">
          {footer}
        </div>
      )}
    </div>
  );
}
