import { SummaryCard } from "@app/components/workspace/analytics/SummaryCard";
import { useAutomationsOverview } from "@app/hooks/useAutomationsOverview";
import type { ConsumptionPeriodSelection } from "@app/lib/analytics/consumption_period";
import { formatCredits } from "@app/lib/client/credits";
import { formatNumber } from "@app/lib/i18n/format";
import type { LightWorkspaceType } from "@app/types/user";
import { LoadingBlock } from "@dust-tt/sparkle";
import { plural } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";

interface AutomationsOverviewProps {
  owner: LightWorkspaceType;
  period: ConsumptionPeriodSelection;
}

export function AutomationsOverview({
  owner,
  period,
}: AutomationsOverviewProps) {
  const { t } = useLingui();
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
  const workspaceShare =
    workspaceTotalCredits > 0
      ? Math.round((automationCredits / workspaceTotalCredits) * 100)
      : null;

  return (
    <div className="flex items-stretch gap-6">
      <SummaryCard
        label={t`Credits`}
        value={formatCredits(automationCredits)}
        hint={
          workspaceShare !== null
            ? t`${workspaceShare}% of workspace consumption`
            : null
        }
      />
      <SummaryCard
        label={t`Triggers enabled`}
        value={`${formatNumber(triggers.enabled)} / ${formatNumber(triggers.total)}`}
        hint={
          disabledCount > 0
            ? t`${plural(disabledCount, { one: "# disabled", other: "# disabled" })}`
            : null
        }
      />
      <SummaryCard
        label={t`Workspace pool`}
        value={`${formatNumber(triggers.workspacePool)} / ${formatNumber(triggers.total)}`}
        hint={memberPoolCount > 0 ? t`${memberPoolCount} on member pool` : null}
      />
    </div>
  );
}
