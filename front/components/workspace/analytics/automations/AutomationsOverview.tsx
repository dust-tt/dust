import { useAutomationsOverview } from "@app/hooks/useAutomationsOverview";
import type { ConsumptionPeriodSelection } from "@app/lib/analytics/consumption_period";
import { formatCredits } from "@app/lib/client/credits";
import type { LightWorkspaceType } from "@app/types/user";
import { LoadingBlock, ValueCard } from "@dust-tt/sparkle";

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
      <ValueCard
        size="sm"
        className="h-24 flex-1"
        title="Credits"
        content={
          <span className="truncate">{formatCredits(automationCredits)}</span>
        }
        footer={
          workspaceTotalCredits > 0
            ? `${Math.round((automationCredits / workspaceTotalCredits) * 100)}% of workspace consumption`
            : undefined
        }
      />
      <ValueCard
        size="sm"
        className="h-24 flex-1"
        title="Triggers enabled"
        content={
          <span className="truncate">{`${triggers.enabled.toLocaleString()} / ${triggers.total.toLocaleString()}`}</span>
        }
        footer={disabledCount > 0 ? `${disabledCount} disabled` : undefined}
      />
      <ValueCard
        size="sm"
        className="h-24 flex-1"
        title="Workspace pool"
        content={
          <span className="truncate">{`${triggers.workspacePool.toLocaleString()} / ${triggers.total.toLocaleString()}`}</span>
        }
        footer={
          memberPoolCount > 0 ? `${memberPoolCount} on member pool` : undefined
        }
      />
    </div>
  );
}
