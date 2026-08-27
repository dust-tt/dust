import type { AnalyticsConsumptionComponents } from "@app/components/pages/workspace/AnalyticsConsumptionPage";
import {
  AnalyticsConsumptionContent,
  useAnalyticsConsumptionState,
} from "@app/components/pages/workspace/AnalyticsConsumptionPage";
import { PokeConsumptionAttributionTable } from "@app/components/poke/analytics/PokeConsumptionAttributionTable";
import { PokeConsumptionOverview } from "@app/components/poke/analytics/PokeConsumptionOverview";
import { PokeConsumptionSummary } from "@app/components/poke/analytics/PokeConsumptionSummary";
import { PokeUsageFilterPanel } from "@app/components/poke/analytics/PokeUsageFilterPanel";
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

interface PokeConsumptionPreviewProps {
  owner: WorkspaceType;
}

export function PokeConsumptionPreview({ owner }: PokeConsumptionPreviewProps) {
  const state = useAnalyticsConsumptionState();

  return (
    <AnalyticsConsumptionContent
      components={POKE_CONSUMPTION_COMPONENTS}
      owner={owner}
      embedded
      showExport={false}
      showMemberGroupFilter={false}
      showOverviewError
      state={state}
      usageHref={`/poke/${owner.sId}?tab=usage`}
      usageLinkLabel="View Usage"
    />
  );
}
