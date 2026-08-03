import type {
  AnalyticsGroupBy,
  Granularity,
} from "@app/components/workspace/AwuUsageFromAnalyticsChart";
import { BaseAwuUsageFromAnalyticsChart } from "@app/components/workspace/AwuUsageFromAnalyticsChart";
import type { AnalyticsFilter } from "@app/components/workspace/analytics/analyticsFilter";
import { scopeFilterToIds } from "@app/components/workspace/analytics/analyticsFilter";
import { getBillingCycleFromDay } from "@app/lib/client/subscription";
import { usePokeAwuUsageFromAnalytics } from "@app/poke/swr/credits";
import type { WorkspaceType } from "@app/types/user";
import { useState } from "react";

interface PokeAwuUsageFromAnalyticsChartProps {
  owner: WorkspaceType;
  billingCycleStartDay: number;
}

export function PokeAwuUsageFromAnalyticsChart({
  owner,
  billingCycleStartDay,
}: PokeAwuUsageFromAnalyticsChartProps) {
  const [granularity, setGranularity] = useState<Granularity>("day");
  const [groupBy, setGroupBy] = useState<AnalyticsGroupBy | undefined>(
    undefined
  );
  const [groupByCount, setGroupByCount] = useState<number>(5);
  const [filter, setFilter] = useState<AnalyticsFilter>({});

  const now = new Date();
  const { cycleStart } = getBillingCycleFromDay(
    billingCycleStartDay,
    now,
    true
  );
  const days = Math.max(
    1,
    Math.ceil((now.getTime() - cycleStart.getTime()) / (24 * 60 * 60 * 1000))
  );

  const { awuUsageData, isAwuUsageLoading, isAwuUsageError } =
    usePokeAwuUsageFromAnalytics({
      owner,
      groupBy,
      groupByCount,
      granularity,
      days,
      filter: scopeFilterToIds(filter),
    });

  return (
    <BaseAwuUsageFromAnalyticsChart
      awuUsageData={awuUsageData}
      isAwuUsageLoading={isAwuUsageLoading}
      isAwuUsageError={!!isAwuUsageError}
      granularity={granularity}
      setGranularity={setGranularity}
      groupBy={groupBy}
      setGroupBy={setGroupBy}
      groupByCount={groupByCount}
      setGroupByCount={setGroupByCount}
      days={days}
      exportUrlPrefix={`/api/poke/workspaces/${owner.sId}/analytics/awu-usage-analytics`}
      filter={filter}
      onFilterChange={setFilter}
    />
  );
}
