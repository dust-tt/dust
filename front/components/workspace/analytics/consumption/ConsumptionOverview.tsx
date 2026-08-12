import type { ConsumptionPaceStatus } from "@app/components/workspace/analytics/consumption/consumptionPace";
import {
  consumptionPace,
  formatRatioAsPercent,
} from "@app/components/workspace/analytics/consumption/consumptionPace";
import { useConsumptionOverview } from "@app/hooks/useConsumptionOverview";
import type { ConsumptionPeriodSelection } from "@app/lib/analytics/consumption_period";
import { formatConsumptionDate } from "@app/lib/analytics/consumption_period";
import type { ConsumptionOverview as ConsumptionOverviewType } from "@app/lib/api/analytics/consumption/overview";
import type { ConsumptionScopeFilter } from "@app/lib/api/analytics/consumption/scope";
import { formatCredits } from "@app/lib/client/credits";
import { useAwuPoolSummary } from "@app/lib/swr/credits";
import { timeAgoFrom } from "@app/lib/utils";
import { ArrowUpRight, Button, Chip } from "@dust-tt/sparkle";

const PACE_CHIP: Record<
  ConsumptionPaceStatus,
  { label: string; color: "highlight" | "info" }
> = {
  on_pace: { label: "On pace", color: "highlight" },
  off_pace: { label: "Off pace", color: "info" },
};

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
  period: ConsumptionPeriodSelection;
}

function ConsumptionSummary({
  workspaceId,
  overview,
  period,
}: ConsumptionSummaryProps) {
  const { totalActiveCredits } = useAwuPoolSummary({ workspaceId });

  // The pool cap covers the billing cycle, so it only lines up with the
  // period's spend when the period *is* the cycle. Over a "last N days" window
  // we report the raw total and leave the cap out.
  const cap = period.kind === "cycle" ? totalActiveCredits : 0;
  const pace =
    cap > 0
      ? consumptionPace({
          usedCredits: overview.totalCredits,
          capCredits: cap,
          period: overview.period,
          nowMs: Date.now(),
        })
      : null;

  const { topAgent, totalCredits } = overview;

  return (
    <div className="flex flex-col gap-4">
      {pace && (
        <div className="flex items-center justify-between gap-4 rounded-xl border border-border p-2">
          <div className="flex items-center gap-2">
            <Chip
              size="mini"
              color={PACE_CHIP[pace.status].color}
              label={PACE_CHIP[pace.status].label}
            />
            <span className="text-sm text-muted-foreground">
              {formatRatioAsPercent(pace.usedRatio)} of the cap used,{" "}
              {formatRatioAsPercent(pace.elapsedRatio)} of the cycle elapsed
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
            cap > 0
              ? `${formatRatioAsPercent(totalCredits / cap)} of ${formatCredits(cap)} cap`
              : null
          }
        />
        <SummaryCard
          label="Top agent"
          value={topAgent ? `@${topAgent.name}` : "—"}
          hint={
            topAgent && totalCredits > 0
              ? `${formatRatioAsPercent(topAgent.credits / totalCredits)} of total spend`
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
      <p className="text-sm text-muted-foreground">{header.join("  |  ")}</p>
      <ConsumptionSummary
        workspaceId={workspaceId}
        overview={overview}
        period={periodSelection}
      />
    </div>
  );
}
