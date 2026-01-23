import { useState } from "react";

import type { DisplayMode } from "@app/components/workspace/ProgrammaticCostChart";
import {
  BaseProgrammaticCostChart,
  formatPeriod,
} from "@app/components/workspace/ProgrammaticCostChart";
import type { GroupByType } from "@app/lib/api/analytics/programmatic_cost";
import { getBillingCycleFromDay } from "@app/lib/client/subscription";
import { usePokeProgrammaticCost } from "@app/poke/swr/credits";
import type { WorkspaceType } from "@app/types";

interface PokeProgrammaticCostChartProps {
  owner: WorkspaceType;
  billingCycleStartDay: number;
}

/**
 * Poke-specific wrapper component that handles data fetching
 * using the poke API endpoint (for super users).
 */
export function PokeProgrammaticCostChart({
  owner,
  billingCycleStartDay,
}: PokeProgrammaticCostChartProps) {
  const [groupBy, setGroupBy] = useState<GroupByType | undefined>(undefined);
  const [filter, setFilter] = useState<Partial<Record<GroupByType, string[]>>>(
    {}
  );
  const [displayMode, setDisplayMode] = useState<DisplayMode>("cumulative");

  // Initialize selectedPeriod to a date within the current billing cycle.
  // Using just formatPeriod(now) would create a date on the 1st of the month,
  // which may fall in the previous billing cycle if billingCycleStartDay > 1.
  // By using the billing cycle's start date, we ensure we're in the correct cycle.
  const now = new Date();
  const currentBillingCycle = getBillingCycleFromDay(
    billingCycleStartDay,
    now,
    false
  );
  const [selectedPeriod, setSelectedPeriod] = useState<string>(
    formatPeriod(currentBillingCycle.cycleStart)
  );

  const {
    programmaticCostData,
    isProgrammaticCostLoading,
    isProgrammaticCostError,
  } = usePokeProgrammaticCost({
    owner,
    selectedPeriod,
    billingCycleStartDay,
    groupBy,
    filter,
  });

  return (
    <BaseProgrammaticCostChart
      programmaticCostData={programmaticCostData}
      isProgrammaticCostLoading={isProgrammaticCostLoading}
      isProgrammaticCostError={!!isProgrammaticCostError}
      groupBy={groupBy}
      setGroupBy={setGroupBy}
      filter={filter}
      setFilter={setFilter}
      selectedPeriod={selectedPeriod}
      setSelectedPeriod={setSelectedPeriod}
      billingCycleStartDay={billingCycleStartDay}
      displayMode={displayMode}
      setDisplayMode={setDisplayMode}
    />
  );
}
