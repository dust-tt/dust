import { ValueCard } from "@dust-tt/sparkle";

interface SummaryCardProps {
  label: string;
  value: string;
  hint: string | null;
}

export function SummaryCard({ label, value, hint }: SummaryCardProps) {
  return (
    <ValueCard
      className="flex-1"
      title={label}
      content={
        <div className="flex flex-col gap-1">
          <div className="truncate text-2xl text-foreground">{value}</div>
          {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
        </div>
      }
    />
  );
}
