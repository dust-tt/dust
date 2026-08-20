import { Page, ProgressBar } from "@dust-tt/sparkle";

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
    <ProgressBar
      className="h-2 bg-muted-foreground/10"
      values={[
        {
          value: percentage,
          className: percentage > 80 ? "bg-warning-700" : "bg-primary",
        },
        { value: 100 - percentage, className: "bg-transparent" },
      ]}
    />
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
        <span className="text-2xl text-muted-foreground">
          /{totalFormatted}
        </span>
      </div>
      <ConsumptionProgressBar consumed={consumed} total={total} />
    </Page.Vertical>
  );
}
