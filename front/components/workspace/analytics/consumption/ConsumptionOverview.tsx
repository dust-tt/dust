import { useConsumptionOverview } from "@app/hooks/useConsumptionOverview";
import type { ConsumptionPeriodSelection } from "@app/lib/analytics/consumption_period";
import { formatConsumptionDate } from "@app/lib/analytics/consumption_period";
import type { ConsumptionScopeFilter } from "@app/lib/api/analytics/consumption/scope";
import { timeAgoFrom } from "@app/lib/utils";

interface ConsumptionOverviewProps {
  workspaceId: string;
  period: ConsumptionPeriodSelection;
  filter?: ConsumptionScopeFilter;
}

export function ConsumptionOverview({
  workspaceId,
  period: periodSelection,
  filter,
}: ConsumptionOverviewProps) {
  const { overview, isOverviewLoading, isOverviewError } =
    useConsumptionOverview({ workspaceId, period: periodSelection, filter });

  if (isOverviewLoading) {
    return (
      <div className="flex flex-col gap-6">
        <div className="h-5 w-80 animate-pulse rounded bg-muted-background" />
      </div>
    );
  }

  if (isOverviewError || !overview) {
    return null;
  }

  const { period, members, lastRecordAt } = overview;

  const header = [
    `${formatConsumptionDate(period.startDate)} to ${formatConsumptionDate(period.endDate)}`,
    `${members.active.toLocaleString()} of ${members.total.toLocaleString()} members active`,
    ...(lastRecordAt
      ? [`Updated ${timeAgoFrom(new Date(lastRecordAt).getTime())} ago`]
      : []),
  ];

  return (
    <div className="flex">
      <p className="text-sm text-muted-foreground">{header.join("  |  ")}</p>
    </div>
  );
}
