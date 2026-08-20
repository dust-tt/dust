import { useConsumptionOverview } from "@app/hooks/useConsumptionOverview";
import type { ConsumptionPeriodSelection } from "@app/lib/analytics/consumption_period";
import { formatConsumptionDate } from "@app/lib/analytics/consumption_period";
import { timeAgoFrom } from "@app/lib/utils";
import { Page } from "@dust-tt/sparkle";

interface ConsumptionOverviewProps {
  workspaceId: string;
  period: ConsumptionPeriodSelection;
}

export function ConsumptionOverview({
  workspaceId,
  period: periodSelection,
}: ConsumptionOverviewProps) {
  const { overview, isOverviewLoading, isOverviewError } =
    useConsumptionOverview({ workspaceId, period: periodSelection });

  if (isOverviewLoading) {
    return (
      <div className="h-5 w-80 animate-pulse rounded bg-muted-background" />
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
    <Page.P variant="secondary">
      {header.map((item, index) => (
        <span key={item}>
          {index > 0 && (
            <span className="mx-2" aria-hidden="true">
              |
            </span>
          )}
          {item}
        </span>
      ))}
    </Page.P>
  );
}
