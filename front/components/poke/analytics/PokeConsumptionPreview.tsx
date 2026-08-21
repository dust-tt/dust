import type { AnalyticsConsumptionComponents } from "@app/components/pages/workspace/AnalyticsConsumptionPage";
import {
  AnalyticsConsumptionContent,
  useAnalyticsConsumptionOptionIndex,
  useAnalyticsConsumptionState,
} from "@app/components/pages/workspace/AnalyticsConsumptionPage";
import { PokeConsumptionAttributionTable } from "@app/components/poke/analytics/PokeConsumptionAttributionTable";
import { PokeConsumptionOverview } from "@app/components/poke/analytics/PokeConsumptionOverview";
import { PokeConsumptionSummary } from "@app/components/poke/analytics/PokeConsumptionSummary";
import { PokeCustomerVisibilityChip } from "@app/components/poke/analytics/PokeCustomerVisibilityChip";
import { PokeUsageFilterPanel } from "@app/components/poke/analytics/PokeUsageFilterPanel";
import { isNavigationLocked } from "@app/lib/navigation-lock";
import { usePokeConsumptionFacets } from "@app/poke/swr/consumption";
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

interface PokeConsumptionPreviewProps {
  owner: WorkspaceType;
}

export function PokeConsumptionPreview({ owner }: PokeConsumptionPreviewProps) {
  const state = useAnalyticsConsumptionState();
  const { options: categoryOptions, isFacetsSettled } =
    usePokeConsumptionFacets({
      workspaceId: owner.sId,
      period: state.period,
      filter: state.scopeFilter,
      disabled: !state.hasSelection,
    });
  const optionIndex = useAnalyticsConsumptionOptionIndex({
    categoryOptions,
    isFacetsSettled,
    state,
  });

  return (
    <AnalyticsConsumptionContent
      components={POKE_CONSUMPTION_COMPONENTS}
      optionIndex={optionIndex}
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
