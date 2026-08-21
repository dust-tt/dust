import type { ConsumptionSummaryProps } from "@app/components/workspace/analytics/consumption/ConsumptionSummary";
import { ConsumptionSummaryView } from "@app/components/workspace/analytics/consumption/ConsumptionSummary";
import { usePokeConsumptionOverview } from "@app/poke/swr/consumption";

export function PokeConsumptionSummary({
  workspaceId,
  period,
  usageHref = `/poke/${workspaceId}?tab=usage`,
  usageLinkLabel = "View Usage",
}: ConsumptionSummaryProps) {
  const { overview, isOverviewLoading, isOverviewError } =
    usePokeConsumptionOverview({ workspaceId, period });

  return (
    <ConsumptionSummaryView
      overview={overview}
      isOverviewLoading={isOverviewLoading}
      isOverviewError={Boolean(isOverviewError)}
      usageHref={usageHref}
      usageLinkLabel={usageLinkLabel}
      responsiveLayout
    />
  );
}
