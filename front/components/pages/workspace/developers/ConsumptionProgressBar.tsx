import { cn, Page } from "@dust-tt/sparkle";

interface ConsumptionProgressBarProps {
  consumed: number;
  total: number;
}

export function ConsumptionProgressBar({
  consumed,
  total,
}: ConsumptionProgressBarProps) {
  const percentage = total > 0 ? Math.min((consumed / total) * 100, 100) : 0;

  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-muted-foreground/10 dark:bg-muted-foreground-night/10">
      <div
        className={cn(
          "h-full rounded-full transition-all",
          percentage > 80
            ? "bg-warning-700"
            : "bg-primary dark:bg-primary-night"
        )}
        style={{ width: `${percentage}%` }}
      />
    </div>
  );
}

interface ConsumptionProgressBarWithNumbersProps {
  consumed: number;
  total: number;
  consumedFormatted: string;
  totalFormatted: string;
}

export function ConsumptionProgressBarWithNumbers({
  consumed,
  total,
  consumedFormatted,
  totalFormatted,
}: ConsumptionProgressBarWithNumbersProps) {
  return (
    <Page.Vertical>
      <Page.P variant="secondary">Total consumed</Page.P>
      <div className="flex items-baseline gap-2">
        <span className="text-5xl font-bold">{consumedFormatted}</span>
        <span className="text-2xl text-muted-foreground dark:text-muted-foreground-night">
          /{totalFormatted}
        </span>
      </div>
      <ConsumptionProgressBar consumed={consumed} total={total} />
    </Page.Vertical>
  );
}
