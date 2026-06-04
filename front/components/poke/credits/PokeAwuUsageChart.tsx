import { BaseAwuUsageChart } from "@app/components/workspace/AwuUsageChart";
import { formatPeriod } from "@app/components/workspace/ProgrammaticCostChart";
import type { AwuUsageGroupByType } from "@app/lib/api/analytics/awu_usage";
import { getBillingCycleFromDay } from "@app/lib/client/subscription";
import { usePokeAwuUsage } from "@app/poke/swr/credits";
import type { WorkspaceType } from "@app/types/user";
import { useState } from "react";

interface PokeAwuUsageChartProps {
  owner: WorkspaceType;
  billingCycleStartDay: number;
}

export function PokeAwuUsageChart({
  owner,
  billingCycleStartDay,
}: PokeAwuUsageChartProps) {
  // Default view is split by usage type (programmatic / user / free).
  const [groupBy, setGroupBy] = useState<AwuUsageGroupByType | undefined>(
    "usage_type"
  );
  const [groupByCount, setGroupByCount] = useState<number>(5);
  const [displayMode, setDisplayMode] = useState<"cumulative" | "daily">(
    "cumulative"
  );
  const [filter, setFilter] = useState<
    Partial<Record<AwuUsageGroupByType, string[]>>
  >({});

  const [selectedPeriod, setSelectedPeriod] = useState<string>(() => {
    const currentBillingCycle = getBillingCycleFromDay(
      billingCycleStartDay,
      new Date(),
      true
    );
    return formatPeriod(currentBillingCycle.cycleStart);
  });

  const { awuUsageData, isAwuUsageLoading, isAwuUsageError } = usePokeAwuUsage({
    owner,
    selectedPeriod,
    billingCycleStartDay,
    groupBy,
    groupByCount,
    windowSize: displayMode === "cumulative" ? "HOUR" : "DAY",
  });

  return (
    <BaseAwuUsageChart
      awuUsageData={awuUsageData}
      isLoading={isAwuUsageLoading}
      isError={!!isAwuUsageError}
      groupBy={groupBy}
      setGroupBy={setGroupBy}
      groupByCount={groupByCount}
      setGroupByCount={setGroupByCount}
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
