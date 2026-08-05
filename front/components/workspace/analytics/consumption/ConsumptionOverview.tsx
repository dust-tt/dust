import { useConsumptionOverview } from "@app/hooks/useConsumptionOverview";
import { timeAgoFrom } from "@app/lib/utils";
import { cn, ValueCard } from "@dust-tt/sparkle";

interface ConsumptionOverviewProps {
  workspaceId: string;
}

// The period is resolved in UTC server-side, so it has to be rendered in UTC here too.
function formatPeriodBound(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function formatCredits(credits: number): string {
  return Math.round(credits).toLocaleString();
}

export function ConsumptionOverview({ workspaceId }: ConsumptionOverviewProps) {
  const { overview, isOverviewLoading, isOverviewError } =
    useConsumptionOverview({ workspaceId });

  if (isOverviewLoading) {
    return (
      <div className="flex flex-col gap-6">
        <div className="h-5 w-80 animate-pulse rounded bg-muted-background" />
        <div className="h-12 w-full animate-pulse rounded-xl bg-muted-background" />
        <div className="grid grid-cols-2 gap-6">
          <div className="h-24 animate-pulse rounded-xl bg-muted-background" />
          <div className="h-24 animate-pulse rounded-xl bg-muted-background" />
        </div>
      </div>
    );
  }

  if (isOverviewError || !overview) {
    return (
      <div
        className={cn(
          "flex flex-col gap-2 rounded-xl border p-6",
          "border-border bg-muted"
        )}
      >
        <p className="heading-lg text-foreground">Analytics unavailable</p>
        <p className="text-sm text-muted-foreground">
          We could not load the consumption overview. Please try again later.
        </p>
      </div>
    );
  }

  const { period, members, credits, lastRecordAt } = overview;

  const metaParts = [
    `${formatPeriodBound(period.startDate)} to ${formatPeriodBound(period.endDate)}`,
    `${members.active.toLocaleString()} of ${members.total.toLocaleString()} members active`,
    ...(lastRecordAt
      ? [`Updated ${timeAgoFrom(new Date(lastRecordAt).getTime())} ago`]
      : []),
  ];

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-muted-foreground">{metaParts.join("  |  ")}</p>

      <div className="grid grid-cols-2 gap-6">
        <ValueCard
          title="Used this period"
          className="h-24"
          content={
            <div className="flex flex-col gap-1">
              <div className="truncate text-2xl text-foreground">
                {formatCredits(credits.usedCredits)}
              </div>
            </div>
          }
        />
      </div>
    </div>
  );
}
