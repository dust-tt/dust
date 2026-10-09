import { useConsumptionOverview } from "@app/hooks/useConsumptionOverview";
import type { ConsumptionPeriodSelection } from "@app/lib/analytics/consumption_period";
import { formatConsumptionDate } from "@app/lib/analytics/consumption_period";
import type { ConsumptionAnalyticsScope } from "@app/lib/analytics/consumption_scope";
import { WORKSPACE_CONSUMPTION_ANALYTICS_SCOPE } from "@app/lib/analytics/consumption_scope";
import type { GetConsumptionOverviewResponse } from "@app/lib/api/analytics/consumption/overview";
import { timeAgoFrom } from "@app/lib/client/relative_time";
import { getActiveLocale } from "@app/lib/i18n/active_locale";
import { formatDateTime, formatNumber } from "@app/lib/i18n/format";
import { LoadingBlock, Page, Tooltip } from "@dust-tt/sparkle";
import { Trans, useLingui } from "@lingui/react/macro";

export interface ConsumptionOverviewProps {
  workspaceId: string;
  period: ConsumptionPeriodSelection;
  showError?: boolean;
  analyticsScope?: ConsumptionAnalyticsScope;
  disabled?: boolean;
}

export function ConsumptionOverview({
  workspaceId,
  period: periodSelection,
  showError = false,
  analyticsScope = WORKSPACE_CONSUMPTION_ANALYTICS_SCOPE,
  disabled,
}: ConsumptionOverviewProps) {
  const { overview, isOverviewLoading, isOverviewError } =
    useConsumptionOverview({
      workspaceId,
      period: periodSelection,
      analyticsScope,
      disabled,
    });

  return (
    <ConsumptionOverviewView
      overview={overview}
      isOverviewLoading={isOverviewLoading}
      isOverviewError={Boolean(isOverviewError)}
      showError={showError}
      analyticsScope={analyticsScope}
    />
  );
}

interface ConsumptionOverviewViewProps {
  overview: GetConsumptionOverviewResponse | null;
  isOverviewLoading: boolean;
  isOverviewError: boolean;
  showError?: boolean;
  showIndexingDetails?: boolean;
  analyticsScope?: ConsumptionAnalyticsScope;
}

export function ConsumptionOverviewView({
  overview,
  isOverviewLoading,
  isOverviewError,
  showError = false,
  showIndexingDetails = false,
  analyticsScope = WORKSPACE_CONSUMPTION_ANALYTICS_SCOPE,
}: ConsumptionOverviewViewProps) {
  const { t } = useLingui();
  if (isOverviewLoading) {
    return <LoadingBlock className="h-5 w-80" />;
  }

  if (isOverviewError || !overview) {
    return showError ? (
      <Page.P variant="secondary">
        <Trans>
          Overview unavailable. Charts and attribution may still load.
        </Trans>
      </Page.P>
    ) : null;
  }

  const { period, members, lastRecordAt } = overview;
  const startDate = formatConsumptionDate(period.startDate, getActiveLocale());
  const endDate = formatConsumptionDate(period.endDate, getActiveLocale());
  const activeMembers = formatNumber(members.active);
  const totalMembers = formatNumber(members.total);
  const lastRecordTimeAgo = lastRecordAt
    ? timeAgoFrom(new Date(lastRecordAt).getTime())
    : null;

  const header = [
    t`${startDate} to ${endDate}`,
    ...(analyticsScope.kind === "workspace"
      ? [t`${activeMembers} of ${totalMembers} members active`]
      : []),
    ...(lastRecordTimeAgo
      ? [
          showIndexingDetails
            ? t`Latest indexed record ${lastRecordTimeAgo}`
            : t`Updated ${lastRecordTimeAgo}`,
        ]
      : []),
  ];

  return (
    <Page.P variant="secondary">
      {header.map((item, index) => (
        <span key={item} className="whitespace-nowrap">
          {index > 0 && (
            <span className="mx-2" aria-hidden="true">
              |
            </span>
          )}
          {showIndexingDetails &&
          lastRecordAt &&
          index === header.length - 1 ? (
            <Tooltip
              label={formatDateTime(new Date(lastRecordAt))}
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
