import { ConsumptionBurnUpChart } from "@app/components/workspace/analytics/consumption/ConsumptionBurnUpChart";
import type { ConsumptionChartProps } from "@app/components/workspace/analytics/consumption/ConsumptionChart";
import {
  CONSUMPTION_CHART_BREAKDOWN_COUNT,
  ConsumptionDailyChart,
} from "@app/components/workspace/analytics/consumption/ConsumptionChart";
import { consumptionGranularityLabel } from "@app/lib/analytics/consumption_period";
import type { ConsumptionTimeseriesMode } from "@app/lib/api/analytics/consumption/timeseries";
import {
  usePokeConsumptionOverview,
  usePokeConsumptionTimeseries,
} from "@app/poke/swr/consumption";
import { ButtonsSwitch, ButtonsSwitchList } from "@dust-tt/sparkle";
import type { ReactNode } from "react";
import { useState } from "react";

interface PokeConsumptionDailyChartProps extends ConsumptionChartProps {
  additionalControls: ReactNode;
}

function PokeConsumptionDailyChart({
  workspaceId,
  period,
  dimension,
  filter,
  additionalControls,
}: PokeConsumptionDailyChartProps) {
  const showActiveUsers = filter?.users?.length !== 1;
  const { timeseries, isTimeseriesLoading, isTimeseriesError } =
    usePokeConsumptionTimeseries({
      workspaceId,
      period,
      mode: "period",
      breakdownBy: dimension,
      breakdownCount: CONSUMPTION_CHART_BREAKDOWN_COUNT,
      filter,
    });
  const { overview } = usePokeConsumptionOverview({
    workspaceId,
    period,
    filter,
    disabled: !showActiveUsers,
  });
  const isFiltered = Object.values(filter ?? {}).some(
    (values) => values.length > 0
  );

  return (
    <ConsumptionDailyChart
      timeseries={timeseries}
      isTimeseriesLoading={isTimeseriesLoading}
      isTimeseriesError={Boolean(isTimeseriesError)}
      emptyMessage={
        isFiltered
          ? "No consumption matches the current filters."
          : "No consumption over this period."
      }
      additionalControls={additionalControls}
      showActiveUsers={showActiveUsers}
      totalUsers={overview?.members.total ?? null}
    />
  );
}

interface PokeConsumptionBurnUpChartProps
  extends Omit<ConsumptionChartProps, "dimension"> {
  additionalControls: ReactNode;
}

function PokeConsumptionBurnUpChart({
  workspaceId,
  period,
  filter,
  additionalControls,
}: PokeConsumptionBurnUpChartProps) {
  const { overview } = usePokeConsumptionOverview({
    workspaceId,
    period,
    filter,
  });
  const isFiltered = Object.values(filter ?? {}).some(
    (values) => values.length > 0
  );
  // A cap only exists on a billing cycle, when there's no filter. Gating on the
  // selection rather than on the response alone keeps a previous cycle's cap —
  // kept around by `keepPreviousData` while the new request lands — from drawing
  // a target over a period that has none.
  const capCredits =
    period.kind === "cycle" && !isFiltered
      ? (overview?.creditUsage?.capCredits ?? null)
      : null;

  const { timeseries, isTimeseriesLoading, isTimeseriesError } =
    usePokeConsumptionTimeseries({
      workspaceId,
      period,
      mode: "cumulative",
      filter,
    });

  return (
    <ConsumptionBurnUpChart
      timeseries={timeseries}
      capCredits={capCredits}
      isTimeseriesLoading={isTimeseriesLoading}
      isTimeseriesError={Boolean(isTimeseriesError)}
      emptyMessage={
        isFiltered
          ? "No consumption matches the current filters."
          : "No consumption over this period."
      }
      additionalControls={additionalControls}
    />
  );
}

export function PokeConsumptionChart({
  workspaceId,
  period,
  dimension,
  filter,
}: ConsumptionChartProps) {
  const [mode, setMode] = useState<ConsumptionTimeseriesMode>("period");
  const modeSelector = (
    <ButtonsSwitchList value={mode} size="xs">
      <ButtonsSwitch
        value="period"
        label={consumptionGranularityLabel("day")}
        onClick={() => setMode("period")}
      />
      <ButtonsSwitch
        value="cumulative"
        label="Cumulative"
        onClick={() => setMode("cumulative")}
      />
    </ButtonsSwitchList>
  );

  return mode === "cumulative" ? (
    <PokeConsumptionBurnUpChart
      workspaceId={workspaceId}
      period={period}
      filter={filter}
      additionalControls={modeSelector}
    />
  ) : (
    <PokeConsumptionDailyChart
      workspaceId={workspaceId}
      period={period}
      dimension={dimension}
      filter={filter}
      additionalControls={modeSelector}
    />
  );
}
