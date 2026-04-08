import { BaseMetronomeUsageChart } from "@app/components/workspace/MetronomeUsageChart";
import { formatPeriod } from "@app/components/workspace/ProgrammaticCostChart";
import type { MetronomeUsageGroupByType } from "@app/lib/api/analytics/metronome_usage";
import { getBillingCycleFromDay } from "@app/lib/client/subscription";
import { usePokeMetronomeUsage } from "@app/poke/swr/credits";
import type { WorkspaceType } from "@app/types/user";
import { useState } from "react";

interface PokeMetronomeUsageChartProps {
  owner: WorkspaceType;
  billingCycleStartDay: number;
}

export function PokeMetronomeUsageChart({
  owner,
  billingCycleStartDay,
}: PokeMetronomeUsageChartProps) {
  const [groupBy, setGroupBy] = useState<MetronomeUsageGroupByType | undefined>(
    undefined
  );
  const [groupByCount, setGroupByCount] = useState<number>(5);
  const [displayMode, setDisplayMode] = useState<"cumulative" | "daily">(
    "cumulative"
  );

  const [selectedPeriod, setSelectedPeriod] = useState<string>(() => {
    const currentBillingCycle = getBillingCycleFromDay(
      billingCycleStartDay,
      new Date(),
      true
    );
    return formatPeriod(currentBillingCycle.cycleStart);
  });

  const { metronomeUsageData, isMetronomeUsageLoading, isMetronomeUsageError } =
    usePokeMetronomeUsage({
      owner,
      selectedPeriod,
      billingCycleStartDay,
      groupBy,
      groupByCount,
      windowSize: displayMode === "cumulative" ? "HOUR" : "DAY",
    });

  return (
    <BaseMetronomeUsageChart
      metronomeUsageData={metronomeUsageData}
      isLoading={isMetronomeUsageLoading}
      isError={!!isMetronomeUsageError}
      groupBy={groupBy}
      setGroupBy={setGroupBy}
      groupByCount={groupByCount}
      setGroupByCount={setGroupByCount}
      selectedPeriod={selectedPeriod}
      setSelectedPeriod={setSelectedPeriod}
      billingCycleStartDay={billingCycleStartDay}
      displayMode={displayMode}
      setDisplayMode={setDisplayMode}
    />
  );
}
