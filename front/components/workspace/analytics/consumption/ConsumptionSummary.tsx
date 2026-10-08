import { MESSAGE_COUNT_LABEL } from "@app/components/workspace/analytics/consumption/consumptionDimensions";
import { SummaryCard } from "@app/components/workspace/analytics/SummaryCard";
import { useConsumptionOverview } from "@app/hooks/useConsumptionOverview";
import type { ConsumptionPeriodSelection } from "@app/lib/analytics/consumption_period";
import type { ConsumptionAnalyticsScope } from "@app/lib/analytics/consumption_scope";
import { WORKSPACE_CONSUMPTION_ANALYTICS_SCOPE } from "@app/lib/analytics/consumption_scope";
import type { GetConsumptionOverviewResponse } from "@app/lib/api/analytics/consumption/overview";
import { useAuth } from "@app/lib/auth/AuthContext";
import {
  formatAvgCreditPerMessageValue,
  formatAvgCreditValue,
  formatCredits,
  formatCreditValue,
} from "@app/lib/client/credits";
import { formatNumber } from "@app/lib/i18n/format";
import { ArrowUpRight, Button, LoadingBlock } from "@dust-tt/sparkle";
import { useLingui } from "@lingui/react/macro";

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
  usageHref = `/w/${workspaceId}/credits`,
  usageLinkLabel,
  analyticsScope = WORKSPACE_CONSUMPTION_ANALYTICS_SCOPE,
  disabled,
}: ConsumptionSummaryProps) {
  const { t } = useLingui();
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
      usageLinkLabel={usageLinkLabel ?? t`Manage in Credits`}
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
  const { t } = useLingui();
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
  const usedPercentage = creditUsage?.status.usedPercentage;
  const capCredits = creditUsage ? formatCredits(creditUsage.capCredits) : null;
  const averageCost =
    averageCostPerMessage === null
      ? null
      : formatAvgCreditPerMessageValue(averageCostPerMessage, t);
  const topAgentShare =
    topAgent && totalCredits > 0
      ? Math.round((topAgent.credits / totalCredits) * 100)
      : null;

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
          label={t`Used this period`}
          value={formatCreditValue(totalCredits, t)}
          hint={creditUsage ? t`${usedPercentage}% of ${capCredits} cap` : null}
        />
        <SummaryCard
          label={t(MESSAGE_COUNT_LABEL)}
          value={formatNumber(messageCount)}
          hint={averageCost}
        />
        <SummaryCard
          label={t`Top agent`}
          value={topAgent?.name ?? "—"}
          hint={
            topAgentShare !== null
              ? t`${topAgentShare}% of total consumption`
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
  const { t } = useLingui();
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
  const averageCost =
    averageCostPerMessage === null
      ? null
      : formatAvgCreditValue(averageCostPerMessage, t);

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
          label={t`Active Users`}
          value={formatNumber(overview.members.active)}
          hint={null}
        />
        <SummaryCard
          className="h-20"
          label={t`Messages / active user`}
          value={formatNumber(messagesPerActiveUser)}
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
          label={t`Total cost`}
          value={formatCreditValue(overview.totalCredits, t)}
          hint={null}
        />
        <SummaryCard
          className="h-20"
          label={t`Avg. cost/msg`}
          value={averageCost ?? "—"}
          hint={null}
        />
      </div>
    </div>
  );
}
