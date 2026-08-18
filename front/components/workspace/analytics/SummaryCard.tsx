interface SummaryCardProps {
  label: string;
  value: string;
  hint: string | null;
}

export function SummaryCard({ label, value, hint }: SummaryCardProps) {
  return (
    <div className="flex flex-1 flex-col justify-center gap-1 rounded-xl border border-border bg-panel-background p-4">
      <span className="text-xs font-semibold text-muted-foreground">
        {label}
      </span>
      <div className="flex flex-col">
        <span className="truncate text-base font-semibold text-foreground">
          {value}
        </span>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </div>
    </div>
  );
}
