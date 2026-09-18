import { SummaryCard } from "@app/components/workspace/analytics/SummaryCard";
import { useConsumptionOverview } from "@app/hooks/useConsumptionOverview";
import type { ConsumptionPeriodSelection } from "@app/lib/analytics/consumption_period";
import type { ConsumptionAnalyticsScope } from "@app/lib/analytics/consumption_scope";
import { WORKSPACE_CONSUMPTION_ANALYTICS_SCOPE } from "@app/lib/analytics/consumption_scope";
import { MESSAGE_COUNT_LABEL } from "@app/components/workspace/analytics/consumption/consumptionDimensions";
import type { GetConsumptionOverviewResponse } from "@app/lib/api/analytics/consumption/overview";
import { useAuth } from "@app/lib/auth/AuthContext";
import { formatAvgCredits, formatCredits } from "@app/lib/client/credits";
import { ArrowUpRight, Button, LoadingBlock } from "@dust-tt/sparkle";

export interface ConsumptionSummaryProps {
  workspaceId: string;
  period: ConsumptionPeriodSelection;
  usageHref?: string;
  usageLinkLabel?: string;
  analyticsScope?: ConsumptionAnalyticsScope;
  disabled?: boolean;
}

// The usage page this summary links to is manager-only, so the link itself
// only shows for managers (mirrors the gating in UsageUpgradeButton).
export function ConsumptionSummary({
  workspaceId,
  period: periodSelection,
  usageHref = `/w/${workspaceId}/usage`,
  usageLinkLabel = "Manage in Usage",
  analyticsScope = WORKSPACE_CONSUMPTION_ANALYTICS_SCOPE,
  disabled,
}: ConsumptionSummaryProps) {
  const { isManager } = useAuth();
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
      showUsageLink={isManager}
    />
  );
}

function averageCreditsPerMessage({
  messageCount,
  totalCredits,
}: GetConsumptionOverviewResponse): number | null {
  return messageCount > 0 ? totalCredits / messageCount : null;
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
  showUsageLink?: boolean;
}

export function ConsumptionSummaryView({
  overview,
  isOverviewLoading,
  isOverviewError,
  usageHref,
  usageLinkLabel,
  responsiveLayout = false,
  analyticsScope = WORKSPACE_CONSUMPTION_ANALYTICS_SCOPE,
  showUsageLink = true,
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
              ? "grid grid-cols-1 gap-4 sm:grid-cols-3"
              : "flex items-stretch gap-6"
          }
        >
          <LoadingBlock className={loadingCardClassName} />
          <LoadingBlock className={loadingCardClassName} />
          <LoadingBlock className={loadingCardClassName} />
        </div>
      </div>
    );
  }

  if (isOverviewError || !overview) {
    return null;
  }

  const { messageCount, topAgent, totalCredits } = overview;
  const averageCostPerMessage = averageCreditsPerMessage(overview);
  const creditUsage =
    analyticsScope.kind === "workspace" ? overview.creditUsage : null;

  return (
    <div className="flex flex-col gap-4">
      {showUsageLink && (
        <div className="flex justify-end">
          <Button
            label={usageLinkLabel}
            variant="highlight-ghost"
            size="xs"
            iconRight={ArrowUpRight}
            href={usageHref}
          />
        </div>
      )}
      <div
        className={
          responsiveLayout
            ? "grid grid-cols-1 gap-4 sm:grid-cols-3"
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
          label={MESSAGE_COUNT_LABEL}
          value={messageCount.toLocaleString()}
          hint={
            averageCostPerMessage === null
              ? null
              : `${formatAvgCredits(averageCostPerMessage)} credits / message`
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
    overview.members.active > 0
      ? Math.round(overview.messageCount / overview.members.active)
      : 0;
  const averageCostPerMessage = averageCreditsPerMessage(overview);

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
          value={messagesPerActiveUser.toLocaleString()}
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
              : `${formatAvgCredits(averageCostPerMessage)} credits`
          }
          hint={null}
        />
      </div>
    </div>
  );
}
