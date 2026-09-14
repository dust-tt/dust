import { SummaryCard } from "@app/components/workspace/analytics/SummaryCard";
import { useAutomationsOverview } from "@app/hooks/useAutomationsOverview";
import type { ConsumptionPeriodSelection } from "@app/lib/analytics/consumption_period";
import { formatCredits } from "@app/lib/client/credits";
import type { LightWorkspaceType } from "@app/types/user";
import { LoadingBlock } from "@dust-tt/sparkle";

interface AutomationsOverviewProps {
  owner: LightWorkspaceType;
  period: ConsumptionPeriodSelection;
}

export function AutomationsOverview({
  owner,
  period,
}: AutomationsOverviewProps) {
  const { overview, isOverviewLoading, isOverviewError } =
    useAutomationsOverview({ workspaceId: owner.sId, period });

  if (isOverviewLoading) {
    return <LoadingBlock className="h-24 w-full rounded-xl" />;
  }

  if (isOverviewError || !overview) {
    return null;
  }

  const { automationCredits, workspaceTotalCredits, triggers } = overview;
  const disabledCount = triggers.total - triggers.enabled;
  const memberPoolCount = triggers.total - triggers.workspacePool;

  return (
    <div className="flex items-stretch gap-6">
      <SummaryCard
        label="Credits"
        value={formatCredits(automationCredits)}
        hint={
          workspaceTotalCredits > 0
            ? `${Math.round((automationCredits / workspaceTotalCredits) * 100)}% of workspace consumption`
            : null
        }
      />
      <SummaryCard
        label="Triggers enabled"
        value={`${triggers.enabled.toLocaleString()} / ${triggers.total.toLocaleString()}`}
        hint={disabledCount > 0 ? `${disabledCount} disabled` : null}
      />
      <SummaryCard
        label="Workspace pool"
        value={`${triggers.workspacePool.toLocaleString()} / ${triggers.total.toLocaleString()}`}
        hint={memberPoolCount > 0 ? `${memberPoolCount} on member pool` : null}
      />
    </div>
  );
}
