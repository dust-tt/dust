import { useState } from "react";

import {
  BaseProgrammaticCostChart,
  formatMonth,
} from "@app/components/workspace/ProgrammaticCostChart";
import type { GroupByType } from "@app/lib/api/analytics/programmatic_cost";
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

  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState<string>(formatMonth(now));

  const {
    programmaticCostData,
    isProgrammaticCostLoading,
    isProgrammaticCostError,
  } = usePokeProgrammaticCost({
    owner,
    selectedMonth,
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
      selectedMonth={selectedMonth}
      setSelectedMonth={setSelectedMonth}
      billingCycleStartDay={billingCycleStartDay}
    />
  );
}
