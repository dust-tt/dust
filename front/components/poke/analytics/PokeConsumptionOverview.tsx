import type { ConsumptionOverviewProps } from "@app/components/workspace/analytics/consumption/ConsumptionOverview";
import { ConsumptionOverviewView } from "@app/components/workspace/analytics/consumption/ConsumptionOverview";
import { usePokeConsumptionOverview } from "@app/poke/swr/consumption";

export function PokeConsumptionOverview({
  workspaceId,
  period,
  showError = false,
}: ConsumptionOverviewProps) {
  const { overview, isOverviewLoading, isOverviewError } =
    usePokeConsumptionOverview({ workspaceId, period });

  return (
    <ConsumptionOverviewView
      overview={overview}
      isOverviewLoading={isOverviewLoading}
      isOverviewError={Boolean(isOverviewError)}
      showError={showError}
      showIndexingDetails
    />
  );
}
