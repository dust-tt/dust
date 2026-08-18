import { SummaryCard } from "@app/components/workspace/analytics/SummaryCard";
import { useAutomationsOverview } from "@app/hooks/useAutomationsOverview";
import type { ConsumptionPeriodSelection } from "@app/lib/analytics/consumption_period";
import { formatCredits } from "@app/lib/client/credits";

interface AutomationsOverviewProps {
  workspaceId: string;
  period: ConsumptionPeriodSelection;
}

export function AutomationsOverview({
  workspaceId,
  period,
}: AutomationsOverviewProps) {
  const { overview, isOverviewLoading, isOverviewError } =
    useAutomationsOverview({ workspaceId, period });

  if (isOverviewLoading) {
    return (
      <div className="h-24 w-full animate-pulse rounded-xl bg-muted-background" />
    );
  }

  if (isOverviewError || !overview) {
    return null;
  }

  const { automationCredits, workspaceTotalCredits, triggers } = overview;
  const disabledCount = triggers.total - triggers.enabled;

  return (
    <div className="flex items-stretch gap-6">
      <SummaryCard
        label="Credits spent"
        value={formatCredits(automationCredits)}
        hint={
          workspaceTotalCredits > 0
            ? `${Math.round((automationCredits / workspaceTotalCredits) * 100)}% of workspace usage`
            : null
        }
      />
      <SummaryCard
        label="Active triggers"
        value={`${triggers.enabled.toLocaleString()} / ${triggers.total.toLocaleString()}`}
        hint={disabledCount > 0 ? `${disabledCount} disabled` : null}
      />
    </div>
  );
}
