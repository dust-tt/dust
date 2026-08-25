import { useConsumptionOverview } from "@app/hooks/useConsumptionOverview";
import type { ConsumptionPeriodSelection } from "@app/lib/analytics/consumption_period";
import { formatConsumptionDate } from "@app/lib/analytics/consumption_period";
import type { GetConsumptionOverviewResponse } from "@app/lib/api/analytics/consumption/overview";
import { timeAgoFrom } from "@app/lib/utils";
import { LoadingBlock, Page, Tooltip } from "@dust-tt/sparkle";

export interface ConsumptionOverviewProps {
  workspaceId: string;
  period: ConsumptionPeriodSelection;
  showError?: boolean;
  personal?: boolean;
  agentId?: string;
  disabled?: boolean;
}

export function ConsumptionOverview({
  workspaceId,
  period: periodSelection,
  showError = false,
  personal,
  agentId,
  disabled,
}: ConsumptionOverviewProps) {
  const { overview, isOverviewLoading, isOverviewError } =
    useConsumptionOverview({
      workspaceId,
      period: periodSelection,
      personal,
      agentId,
      disabled,
    });

  return (
    <ConsumptionOverviewView
      overview={overview}
      isOverviewLoading={isOverviewLoading}
      isOverviewError={Boolean(isOverviewError)}
      showError={showError}
      personal={personal || agentId !== undefined}
    />
  );
}

interface ConsumptionOverviewViewProps {
  overview: GetConsumptionOverviewResponse | null;
  isOverviewLoading: boolean;
  isOverviewError: boolean;
  showError?: boolean;
  showIndexingDetails?: boolean;
  personal?: boolean;
}

export function ConsumptionOverviewView({
  overview,
  isOverviewLoading,
  isOverviewError,
  showError = false,
  showIndexingDetails = false,
  personal,
}: ConsumptionOverviewViewProps) {
  if (isOverviewLoading) {
    return <LoadingBlock className="h-5 w-80" />;
  }

  if (isOverviewError || !overview) {
    return showError ? (
      <Page.P variant="secondary">
        Overview unavailable. Charts and attribution may still load.
      </Page.P>
    ) : null;
  }

  const { period, members, lastRecordAt } = overview;

  const header = [
    `${formatConsumptionDate(period.startDate)} to ${formatConsumptionDate(period.endDate)}`,
    ...(personal
      ? []
      : [
          `${members.active.toLocaleString()} of ${members.total.toLocaleString()} members active`,
        ]),
    ...(lastRecordAt
      ? [
          showIndexingDetails
            ? `Latest indexed record ${timeAgoFrom(new Date(lastRecordAt).getTime())} ago`
            : `Updated ${timeAgoFrom(new Date(lastRecordAt).getTime())} ago`,
        ]
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
          {showIndexingDetails &&
          lastRecordAt &&
          index === header.length - 1 ? (
            <Tooltip
              label={new Date(lastRecordAt).toLocaleString()}
              tooltipTriggerAsChild
              trigger={<span>{item}</span>}
            />
          ) : (
            item
          )}
        </span>
      ))}
    </Page.P>
  );
}
