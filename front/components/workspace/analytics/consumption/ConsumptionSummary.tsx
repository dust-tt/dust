import { SummaryCard } from "@app/components/workspace/analytics/SummaryCard";
import { useConsumptionOverview } from "@app/hooks/useConsumptionOverview";
import type { ConsumptionPeriodSelection } from "@app/lib/analytics/consumption_period";
import type { ConsumptionPeriod } from "@app/lib/api/analytics/consumption/period";
import { formatCredits } from "@app/lib/client/credits";
import type { CreditUsageTarget } from "@app/types/api/credits/usage_status";
import { ArrowUpRight, Button, Chip } from "@dust-tt/sparkle";

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

interface ConsumptionSummaryProps {
  workspaceId: string;
  period: ConsumptionPeriodSelection;
}

export function ConsumptionSummary({
  workspaceId,
  period: periodSelection,
}: ConsumptionSummaryProps) {
  const { overview, isOverviewLoading, isOverviewError } =
    useConsumptionOverview({ workspaceId, period: periodSelection });

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

  const { topAgent, totalCredits, creditUsage } = overview;

  return (
    <div className="flex flex-col gap-4">
      {creditUsage && (
        <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-panel-background p-2">
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
            label="Manage in Usage"
            variant="highlight-ghost"
            size="xs"
            iconRight={ArrowUpRight}
            href={`/w/${workspaceId}/usage`}
          />
        </div>
      )}
      <div className="flex items-stretch gap-6">
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
              ? `${Math.round((topAgent.credits / totalCredits) * 100)}% of total spend`
              : null
          }
        />
      </div>
    </div>
  );
}
