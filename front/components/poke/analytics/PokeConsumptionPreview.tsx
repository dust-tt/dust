import type { AnalyticsConsumptionComponents } from "@app/components/pages/workspace/AnalyticsConsumptionPage";
import {
  AnalyticsConsumptionContent,
  useAnalyticsConsumptionState,
} from "@app/components/pages/workspace/AnalyticsConsumptionPage";
import { PokeConsumptionAttributionTable } from "@app/components/poke/analytics/PokeConsumptionAttributionTable";
import { PokeConsumptionOverview } from "@app/components/poke/analytics/PokeConsumptionOverview";
import { PokeConsumptionSummary } from "@app/components/poke/analytics/PokeConsumptionSummary";
import { PokeCustomerVisibilityChip } from "@app/components/poke/analytics/PokeCustomerVisibilityChip";
import { PokeUsageFilterPanel } from "@app/components/poke/analytics/PokeUsageFilterPanel";
import type { ConsumptionDimension } from "@app/components/workspace/analytics/consumption/consumptionDimensions";
import { CONSUMPTION_DIMENSIONS } from "@app/components/workspace/analytics/consumption/consumptionDimensions";
import { isNavigationLocked } from "@app/lib/navigation-lock";
import type { WorkspaceType } from "@app/types/user";
import { safeLazy } from "@dust-tt/sparkle";

const canReload = () => !isNavigationLocked();

// Keep Recharts out of the initial Poke bundle until the analytics preview is
// rendered.
const PokeConsumptionChart = safeLazy(
  () =>
    import("@app/components/poke/analytics/PokeConsumptionChart").then(
      (mod) => ({ default: mod.PokeConsumptionChart })
    ),
  { canReload }
);

const POKE_CONSUMPTION_COMPONENTS: AnalyticsConsumptionComponents = {
  AttributionTable: PokeConsumptionAttributionTable,
  Chart: PokeConsumptionChart,
  Overview: PokeConsumptionOverview,
  Summary: PokeConsumptionSummary,
  UsageFilterPanel: PokeUsageFilterPanel,
};

const POKE_CONSUMPTION_DIMENSIONS = [
  ...CONSUMPTION_DIMENSIONS,
  "automation",
] as const satisfies readonly ConsumptionDimension[];

interface PokeConsumptionPreviewProps {
  owner: WorkspaceType;
}

export function PokeConsumptionPreview({ owner }: PokeConsumptionPreviewProps) {
  const state = useAnalyticsConsumptionState({
    dimensions: POKE_CONSUMPTION_DIMENSIONS,
  });

  return (
    <AnalyticsConsumptionContent
      components={POKE_CONSUMPTION_COMPONENTS}
      dimensions={POKE_CONSUMPTION_DIMENSIONS}
      owner={owner}
      embedded
      headerBadge={
        <PokeCustomerVisibilityChip
          feature="enable_analytics_consumption"
          owner={owner}
        />
      }
      showExport={false}
      showMemberGroupFilter={false}
      showOverviewError
      state={state}
      usageHref={`/poke/${owner.sId}?tab=usage`}
      usageLinkLabel="View Usage"
    />
  );
}
