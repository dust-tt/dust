import { useConsumptionOverview } from "@app/hooks/useConsumptionOverview";
import type { ConsumptionPeriodSelection } from "@app/lib/analytics/consumption_period";
import { formatConsumptionDate } from "@app/lib/analytics/consumption_period";
import type { ConsumptionOverview as ConsumptionOverviewType } from "@app/lib/api/analytics/consumption/overview";
import type { ConsumptionPeriod } from "@app/lib/api/analytics/consumption/period";
import type { ConsumptionScopeFilter } from "@app/lib/api/analytics/consumption/scope";
import { formatCredits } from "@app/lib/client/credits";
import { timeAgoFrom } from "@app/lib/utils";
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

interface SummaryCardProps {
  label: string;
  value: string;
  hint: string | null;
}

function SummaryCard({ label, value, hint }: SummaryCardProps) {
  return (
    <div className="flex flex-1 flex-col justify-center gap-1 rounded-xl border border-border p-4">
      <span className="text-xs font-semibold text-muted-foreground">
        {label}
      </span>
      <div className="flex flex-col">
        <span className="truncate text-base font-semibold text-foreground">
          {value}
        </span>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </div>
    </div>
  );
}

interface ConsumptionSummaryProps {
  workspaceId: string;
  overview: ConsumptionOverviewType;
}

function ConsumptionSummary({
  workspaceId,
  overview,
}: ConsumptionSummaryProps) {
  const { topAgent, totalCredits, creditUsage } = overview;

  return (
    <div className="flex flex-col gap-4">
      {creditUsage && (
        <div className="flex items-center justify-between gap-4 rounded-xl border border-border p-2">
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
        <div className="h-32 w-full animate-pulse rounded-xl bg-muted-background" />
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
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
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
      </p>
      <ConsumptionSummary workspaceId={workspaceId} overview={overview} />
    </div>
  );
}
