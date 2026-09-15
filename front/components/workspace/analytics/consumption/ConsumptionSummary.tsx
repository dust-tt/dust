import { SummaryCard } from "@app/components/workspace/analytics/SummaryCard";
import { useConsumptionOverview } from "@app/hooks/useConsumptionOverview";
import type { ConsumptionPeriodSelection } from "@app/lib/analytics/consumption_period";
import type { ConsumptionAnalyticsScope } from "@app/lib/analytics/consumption_scope";
import { WORKSPACE_CONSUMPTION_ANALYTICS_SCOPE } from "@app/lib/analytics/consumption_scope";
import type { GetConsumptionOverviewResponse } from "@app/lib/api/analytics/consumption/overview";
import type { ConsumptionPeriod } from "@app/lib/api/analytics/consumption/period";
import { formatCredits } from "@app/lib/client/credits";
import { ArrowUpRight, Button, LoadingBlock } from "@dust-tt/sparkle";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * @cc [owner:avervaet,label:product] cycle-day-within-bounds
 * `day` is a 1-indexed count of elapsed days in the cycle, always in
 * `[1, totalDays]` regardless of how `now` relates to `startDate`/`endDate`:
 * before the cycle starts it is 1, once the cycle has ended it is `totalDays`.
 */
function cycleDayProgress({ startDate, endDate }: ConsumptionPeriod): {
  day: number;
  totalDays: number;
} {
  const startMs = new Date(startDate).getTime();
  const endMs = new Date(endDate).getTime();
  const totalDays = Math.max(Math.round((endMs - startMs) / MS_PER_DAY), 1);
  const elapsedMs = Math.min(
    Math.max(Date.now() - startMs, 0),
    endMs - startMs
  );
  const day = Math.min(Math.floor(elapsedMs / MS_PER_DAY) + 1, totalDays);
  return { day, totalDays };
}

export interface ConsumptionSummaryProps {
  workspaceId: string;
  period: ConsumptionPeriodSelection;
  usageHref?: string;
  usageLinkLabel?: string;
  analyticsScope?: ConsumptionAnalyticsScope;
  disabled?: boolean;
}

export function ConsumptionSummary({
  workspaceId,
  period: periodSelection,
  usageHref = `/w/${workspaceId}/usage`,
  usageLinkLabel = "Manage in Usage",
  analyticsScope = WORKSPACE_CONSUMPTION_ANALYTICS_SCOPE,
  disabled,
}: ConsumptionSummaryProps) {
  const { overview, isOverviewLoading, isOverviewError } =
    useConsumptionOverview({
      workspaceId,
      period: periodSelection,
      analyticsScope,
      disabled,
    });

  return (
    <ConsumptionSummaryView
      overview={overview}
      isOverviewLoading={isOverviewLoading}
      isOverviewError={Boolean(isOverviewError)}
      usageHref={usageHref}
      usageLinkLabel={usageLinkLabel}
      analyticsScope={analyticsScope}
    />
  );
}

interface ConsumptionSummaryData {
  overview: GetConsumptionOverviewResponse | null;
  isOverviewLoading: boolean;
  isOverviewError: boolean;
}

interface ConsumptionSummaryViewProps extends ConsumptionSummaryData {
  usageHref: string;
  usageLinkLabel: string;
  responsiveLayout?: boolean;
  analyticsScope?: ConsumptionAnalyticsScope;
}

export function ConsumptionSummaryView({
  overview,
  isOverviewLoading,
  isOverviewError,
  usageHref,
  usageLinkLabel,
  responsiveLayout = false,
  analyticsScope = WORKSPACE_CONSUMPTION_ANALYTICS_SCOPE,
}: ConsumptionSummaryViewProps) {
  if (analyticsScope.kind === "agent") {
    return (
      <AgentConsumptionSummaryView
        overview={overview}
        isOverviewLoading={isOverviewLoading}
        isOverviewError={isOverviewError}
        responsiveLayout={responsiveLayout}
      />
    );
  }

  const loadingCardClassName = responsiveLayout
    ? "h-24 rounded-xl"
    : "h-24 flex-1 rounded-xl";

  if (isOverviewLoading) {
    return (
      <div className="flex flex-col gap-4">
        <div
          className={
            responsiveLayout
              ? "grid grid-cols-1 gap-4 sm:grid-cols-2"
              : "flex items-stretch gap-6"
          }
        >
          <LoadingBlock className={loadingCardClassName} />
          <LoadingBlock className={loadingCardClassName} />
        </div>
      </div>
    );
  }

  if (isOverviewError || !overview) {
    return null;
  }

  const { topAgent, totalCredits } = overview;
  const creditUsage =
    analyticsScope.kind === "workspace" ? overview.creditUsage : null;
  const cycleProgress = creditUsage ? cycleDayProgress(overview.period) : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        {creditUsage && cycleProgress && (
          <span className="text-sm text-muted-foreground">
            {formatCredits(totalCredits)} credits used this cycle, day{" "}
            {cycleProgress.day}/{cycleProgress.totalDays} of the cycle
          </span>
        )}
        <div className="ml-auto">
          <Button
            label={usageLinkLabel}
            variant="highlight-ghost"
            size="xs"
            iconRight={ArrowUpRight}
            href={usageHref}
          />
        </div>
      </div>
      <div
        className={
          responsiveLayout
            ? "grid grid-cols-1 gap-4 sm:grid-cols-2"
            : "flex items-stretch gap-6"
        }
      >
        <SummaryCard
          label="Used this period"
          value={`${formatCredits(totalCredits)} credits`}
          hint={
            creditUsage
              ? `${creditUsage.status.usedPercentage}% of ${formatCredits(creditUsage.capCredits)} cap`
              : null
          }
        />
        <SummaryCard
          label="Top agent"
          value={topAgent?.name ?? "—"}
          hint={
            topAgent && totalCredits > 0
              ? `${Math.round((topAgent.credits / totalCredits) * 100)}% of total consumption`
              : null
          }
        />
      </div>
    </div>
  );
}

interface AgentConsumptionSummaryViewProps extends ConsumptionSummaryData {
  responsiveLayout: boolean;
}

function AgentConsumptionSummaryView({
  overview,
  isOverviewLoading,
  isOverviewError,
  responsiveLayout,
}: AgentConsumptionSummaryViewProps) {
  const loadingCardClassName = responsiveLayout
    ? "h-20 rounded-xl"
    : "h-20 flex-1 rounded-xl";

  if (isOverviewLoading) {
    return (
      <div className="flex flex-col gap-6">
        <div
          className={
            responsiveLayout
              ? "grid grid-cols-1 gap-4 sm:grid-cols-2"
              : "flex items-stretch gap-6"
          }
        >
          <LoadingBlock className={loadingCardClassName} />
          <LoadingBlock className={loadingCardClassName} />
        </div>
        <div
          className={
            responsiveLayout
              ? "grid grid-cols-1 gap-4 sm:grid-cols-2"
              : "flex items-stretch gap-6"
          }
        >
          <LoadingBlock className={loadingCardClassName} />
          <LoadingBlock className={loadingCardClassName} />
        </div>
      </div>
    );
  }

  if (isOverviewError || !overview) {
    return null;
  }

  const messagesPerActiveUser =
    overview.messageCount === undefined
      ? null
      : overview.members.active > 0
        ? Math.round(overview.messageCount / overview.members.active)
        : 0;
  const averageCostPerMessage =
    overview.messageCount !== undefined && overview.messageCount > 0
      ? overview.totalCredits / overview.messageCount
      : null;

  return (
    <div className="flex flex-col gap-6">
      <div
        className={
          responsiveLayout
            ? "grid grid-cols-1 gap-4 sm:grid-cols-2"
            : "flex items-stretch gap-6"
        }
      >
        <SummaryCard
          className="h-20"
          label="Active Users"
          value={overview.members.active.toLocaleString()}
          hint={null}
        />
        <SummaryCard
          className="h-20"
          label="Messages / active user"
          value={messagesPerActiveUser?.toLocaleString() ?? "—"}
          hint={null}
        />
      </div>
      <div
        className={
          responsiveLayout
            ? "grid grid-cols-1 gap-4 sm:grid-cols-2"
            : "flex items-stretch gap-6"
        }
      >
        <SummaryCard
          className="h-20"
          label="Total cost"
          value={`${formatCredits(overview.totalCredits)} credits`}
          hint={null}
        />
        <SummaryCard
          className="h-20"
          label="Avg. cost/msg"
          value={
            averageCostPerMessage === null
              ? "—"
              : `${formatCredits(averageCostPerMessage)} credits`
          }
          hint={null}
        />
      </div>
    </div>
  );
}
