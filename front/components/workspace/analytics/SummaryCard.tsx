import { cn, Spinner } from "@dust-tt/sparkle";

interface SummaryCardProps {
  className?: string;
  label: string;
  value: string;
  hint: string | null;
  // Shows the value is being refreshed while keeping the previous one visible.
  isRefreshing?: boolean;
}

export function SummaryCard({
  className,
  label,
  value,
  hint,
  isRefreshing = false,
}: SummaryCardProps) {
  return (
    <div
      className={cn(
        "flex flex-1 flex-col justify-center h-24 gap-1 rounded-xl",
        "border border-border bg-panel-background p-4",
        className
      )}
    >
      <span className="text-xs font-semibold text-muted-foreground">
        {label}
      </span>
      <div className="flex flex-col">
        <span className="flex items-center gap-2 text-base font-semibold text-foreground">
          <span className="truncate">{value}</span>
          {isRefreshing && <Spinner size="xs" />}
        </span>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </div>
    </div>
  );
}
