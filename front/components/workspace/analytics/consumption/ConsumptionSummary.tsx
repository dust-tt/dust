import { SummaryCard } from "@app/components/workspace/analytics/SummaryCard";
import { useConsumptionOverview } from "@app/hooks/useConsumptionOverview";
import type { ConsumptionPeriodSelection } from "@app/lib/analytics/consumption_period";
import type { ConsumptionAnalyticsScope } from "@app/lib/analytics/consumption_scope";
import { WORKSPACE_CONSUMPTION_ANALYTICS_SCOPE } from "@app/lib/analytics/consumption_scope";
import type { GetConsumptionOverviewResponse } from "@app/lib/api/analytics/consumption/overview";
import type { ConsumptionPeriod } from "@app/lib/api/analytics/consumption/period";
import { formatCredits } from "@app/lib/client/credits";
import type { CreditUsageTarget } from "@app/types/api/credits/usage_status";
import {
  ArrowUpRight,
  Button,
  CardGrid,
  Chip,
  LoadingBlock,
  ValueCard,
} from "@dust-tt/sparkle";

const TARGET_CHIP: Record<
  CreditUsageTarget,
  { label: string; color: "highlight" | "info" | "warning" }
> = {
  on_target: { label: "On target", color: "highlight" },
  elevated: { label: "Off target", color: "info" },
  critical: { label: "Critical", color: "warning" },
};

// The counterpart the used share of the cap is read against.
function cycleElapsedPercent({
  startDate,
  endDate,
}: ConsumptionPeriod): number {
  const startMs = new Date(startDate).getTime();
  const endMs = new Date(endDate).getTime();
  const elapsedRatio = (Date.now() - startMs) / (endMs - startMs);
  return Math.round(Math.min(Math.max(elapsedRatio, 0), 1) * 100);
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

interface ConsumptionSummaryViewProps {
  overview: GetConsumptionOverviewResponse | null;
  isOverviewLoading: boolean;
  isOverviewError: boolean;
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
  const isAgentScoped = analyticsScope.kind === "agent";

  if (isOverviewLoading) {
    return (
      <div className="flex flex-col gap-4">
        {isAgentScoped && (
          <CardGrid adaptColumns>
            <LoadingBlock className="h-24 rounded-xl" />
            <LoadingBlock className="h-24 rounded-xl" />
          </CardGrid>
        )}
        <div
          className={
            responsiveLayout
              ? "grid grid-cols-1 gap-4 sm:grid-cols-2"
              : "flex items-stretch gap-6"
          }
        >
          <LoadingBlock
            className={
              responsiveLayout ? "h-24 rounded-xl" : "h-24 flex-1 rounded-xl"
            }
          />
          <LoadingBlock
            className={
              responsiveLayout ? "h-24 rounded-xl" : "h-24 flex-1 rounded-xl"
            }
          />
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
  const messagesPerActiveUser =
    overview.messageCount === undefined
      ? null
      : overview.members.active > 0
        ? Math.round(overview.messageCount / overview.members.active)
        : 0;
  const averageCostPerMessage =
    overview.messageCount !== undefined && overview.messageCount > 0
      ? totalCredits / overview.messageCount
      : null;

  return (
    <div className="flex flex-col gap-4">
      {creditUsage && (
        <div
          className={
            responsiveLayout
              ? "flex flex-col items-start justify-between gap-3 rounded-xl border border-border bg-panel-background p-2 sm:flex-row sm:items-center"
              : "flex items-center justify-between gap-4 rounded-xl border border-border bg-panel-background p-2"
          }
        >
          <div className="flex items-center gap-2">
            <Chip
              size="mini"
              color={TARGET_CHIP[creditUsage.status.target].color}
              label={TARGET_CHIP[creditUsage.status.target].label}
            />
            <span className="text-sm text-muted-foreground">
              {creditUsage.status.usedPercentage}% of the cap used,{" "}
              {cycleElapsedPercent(overview.period)}% of the cycle elapsed
            </span>
          </div>
          <Button
            label={usageLinkLabel}
            variant="highlight-ghost"
            size="xs"
            iconRight={ArrowUpRight}
            href={usageHref}
          />
        </div>
      )}
      {isAgentScoped && (
        <CardGrid adaptColumns>
          <ValueCard
            title="Active Users"
            className="h-24 bg-panel-background"
            content={
              <div className="truncate text-2xl tabular-nums text-foreground">
                {overview.members.active.toLocaleString()}
              </div>
            }
          />
          <ValueCard
            title="Messages / active user"
            className="h-24 bg-panel-background"
            content={
              <div className="truncate text-2xl tabular-nums text-foreground">
                {messagesPerActiveUser?.toLocaleString() ?? "—"}
              </div>
            }
          />
        </CardGrid>
      )}
      <div
        className={
          responsiveLayout
            ? "grid grid-cols-1 gap-4 sm:grid-cols-2"
            : "flex items-stretch gap-6"
        }
      >
        {isAgentScoped ? (
          <>
            <SummaryCard
              label="Total cost"
              value={`${formatCredits(totalCredits)} credits`}
              hint={null}
            />
            <SummaryCard
              label="Avg. cost/msg"
              value={
                averageCostPerMessage === null
                  ? "—"
                  : `${formatCredits(averageCostPerMessage)} credits`
              }
              hint={null}
            />
          </>
        ) : (
          <>
            <SummaryCard
              label="Used this period"
              value={formatCredits(totalCredits)}
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
          </>
        )}
      </div>
    </div>
  );
}
