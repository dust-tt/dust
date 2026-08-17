import { useAutomationsTriggerBreakdown } from "@app/hooks/useAutomationsTriggerBreakdown";
import type { ConsumptionPeriodSelection } from "@app/lib/analytics/consumption_period";
import type { AutomationTriggerRow } from "@app/lib/api/analytics/automations/triggers";
import { formatCredits } from "@app/lib/client/credits";
import { LoadingBlock, Tooltip } from "@dust-tt/sparkle";
import type { ReactNode } from "react";

const CAPTION_TOOLTIP_LABEL =
  "Compared to the median across all triggers for this period.";

const RATIO_MORE_THRESHOLD = 1.5;
const RATIO_LESS_THRESHOLD = 1 / RATIO_MORE_THRESHOLD;

function ratioCaption(value: number, median: number): string {
  if (median <= 0) {
    return "no comparison available";
  }
  const ratio = value / median;
  if (ratio >= RATIO_MORE_THRESHOLD) {
    return `${Math.round(ratio)}x more than most`;
  }
  if (ratio <= RATIO_LESS_THRESHOLD) {
    return `${Math.round(1 / ratio)}x less than most`;
  }
  return "about typical";
}

function StatBlock({
  label,
  primaryText,
  caption,
}: {
  label: string;
  primaryText: ReactNode;
  caption: string;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <h4 className="text-xs font-semibold text-muted-foreground">{label}</h4>
      <div className="flex min-w-0 items-baseline gap-2 text-xs">
        <div className="truncate">{primaryText}</div>
        <Tooltip
          trigger={
            <span className="truncate text-muted-foreground">{caption}</span>
          }
          label={CAPTION_TOOLTIP_LABEL}
        />
      </div>
    </div>
  );
}

function CreditDestinationBlock({
  workspaceId,
  triggerId,
  period,
}: {
  workspaceId: string;
  triggerId: string;
  period: ConsumptionPeriodSelection;
}) {
  const { creditDestination, isBreakdownLoading, isBreakdownError } =
    useAutomationsTriggerBreakdown({ workspaceId, triggerId, period });

  if (isBreakdownLoading) {
    return (
      <div className="flex min-w-0 flex-col gap-2">
        <h4 className="text-xs font-semibold text-muted-foreground">
          Where the credits go
        </h4>
        <div className="flex items-baseline gap-2">
          <LoadingBlock className="h-4 w-24" />
          <LoadingBlock className="h-3 w-20" />
        </div>
      </div>
    );
  }

  if (isBreakdownError || !creditDestination) {
    return (
      <div className="flex min-w-0 flex-col gap-2">
        <h4 className="text-xs font-semibold text-muted-foreground">
          Where the credits go
        </h4>
        <span className="text-xs text-muted-foreground">
          {isBreakdownError
            ? "Failed to load breakdown."
            : "No attributed consumption."}
        </span>
      </div>
    );
  }

  const percentage = Math.round(Math.min(100, creditDestination.share * 100));

  return (
    <StatBlock
      label="Where the credits go"
      primaryText={
        <span className="font-semibold text-foreground">
          {creditDestination.name}
        </span>
      }
      caption={`${percentage}% of its credits`}
    />
  );
}

interface AutomationsTriggerBreakdownProps {
  workspaceId: string;
  trigger: AutomationTriggerRow;
  period: ConsumptionPeriodSelection;
  medianRunCount: number;
  medianCostPerRun: number;
}

export function AutomationsTriggerBreakdown({
  workspaceId,
  trigger,
  period,
  medianRunCount,
  medianCostPerRun,
}: AutomationsTriggerBreakdownProps) {
  const costPerRun =
    trigger.runCount > 0 ? trigger.credits / trigger.runCount : 0;

  return (
    <div className="grid grid-cols-3 gap-16 border-b border-separator px-2 pb-6 pt-4">
      <StatBlock
        label="How often it runs"
        primaryText={
          <>
            <span className="font-semibold text-foreground">
              {trigger.runCount.toLocaleString()}
            </span>{" "}
            <span className="text-muted-foreground">times</span>
          </>
        }
        caption={ratioCaption(trigger.runCount, medianRunCount)}
      />
      <StatBlock
        label="What each run costs"
        primaryText={
          <>
            <span className="font-semibold text-foreground">
              {formatCredits(costPerRun)}
            </span>{" "}
            <span className="text-muted-foreground">credits</span>
          </>
        }
        caption={ratioCaption(costPerRun, medianCostPerRun)}
      />
      <CreditDestinationBlock
        workspaceId={workspaceId}
        triggerId={trigger.triggerId}
        period={period}
      />
    </div>
  );
}
