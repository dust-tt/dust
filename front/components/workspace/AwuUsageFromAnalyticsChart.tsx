import type { ObservabilityTimeRangeType } from "@app/components/agent_builder/observability/constants";
import {
  CHART_HEIGHT,
  COST_PALETTE,
  OTHER_LABEL,
} from "@app/components/agent_builder/observability/constants";
import {
  getIndexedColor,
  getSourceColor,
  isUserMessageOrigin,
} from "@app/components/agent_builder/observability/utils";
import { ChartContainer } from "@app/components/charts/ChartContainer";
import type { LegendItem } from "@app/components/charts/ChartLegend";
import { ChartTooltipCard } from "@app/components/charts/ChartTooltip";
import { CsvDownloadButton } from "@app/components/workspace/analytics/CsvDownloadButton";
import { useDownloadCsv } from "@app/hooks/useDownloadCsv";
import type { AwuUsageAnalyticsResponse } from "@app/lib/api/analytics/awu_usage_analytics";
import { formatCredits, formatCreditsCompact } from "@app/lib/client/credits";
import { useAwuUsageFromAnalytics } from "@app/lib/swr/workspaces";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@dust-tt/sparkle";
import { useCallback, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from "recharts";
import type { TooltipContentProps } from "recharts/types/component/Tooltip";

interface AwuUsageFromAnalyticsChartProps {
  workspaceId: string;
  period: ObservabilityTimeRangeType;
}

export type Granularity = "day" | "week" | "month";
export type AnalyticsGroupBy = "usage_type" | "agent" | "user" | "origin";

const GROUP_BY_OPTIONS: {
  value: AnalyticsGroupBy | undefined;
  label: string;
}[] = [
  { value: undefined, label: "Total" },
  { value: "usage_type", label: "By Usage Type" },
  { value: "agent", label: "By Agent" },
  { value: "user", label: "By User" },
  { value: "origin", label: "By Source" },
];

const GRANULARITY_OPTIONS: { value: Granularity; label: string }[] = [
  { value: "day", label: "Daily" },
  { value: "week", label: "Weekly" },
  { value: "month", label: "Monthly" },
];

const TOP_K_OPTIONS = [5, 10, 15, 20, 30];

function getColorClassName(
  groupBy: AnalyticsGroupBy | undefined,
  groupKey: string,
  allKeys: string[]
): string {
  if (!groupBy) {
    return COST_PALETTE.totalCredits;
  }
  if (groupKey === "others") {
    return OTHER_LABEL.color;
  }
  if (groupBy === "origin" && isUserMessageOrigin(groupKey)) {
    return getSourceColor(groupKey);
  }
  return getIndexedColor(groupKey, allKeys);
}

function formatTimestamp(timestamp: number, granularity: Granularity): string {
  return new Date(timestamp).toLocaleDateString("en-US", {
    month: "short",
    day: granularity === "month" ? undefined : "numeric",
    year: granularity === "month" ? "numeric" : undefined,
    timeZone: "UTC",
  });
}

export interface BaseAwuUsageFromAnalyticsChartProps {
  awuUsageData: AwuUsageAnalyticsResponse | undefined;
  isAwuUsageLoading: boolean;
  isAwuUsageError: boolean;
  granularity: Granularity;
  setGranularity: (v: Granularity) => void;
  groupBy: AnalyticsGroupBy | undefined;
  setGroupBy: (v: AnalyticsGroupBy | undefined) => void;
  groupByCount: number;
  setGroupByCount: (v: number) => void;
  // Number of days this chart covers — used for the filename and export URL.
  days: number;
  // Base URL for the CSV export endpoint (without query params).
  exportUrlPrefix: string;
}

export function BaseAwuUsageFromAnalyticsChart({
  awuUsageData,
  isAwuUsageLoading,
  isAwuUsageError,
  granularity,
  setGranularity,
  groupBy,
  setGroupBy,
  groupByCount,
  setGroupByCount,
  days,
  exportUrlPrefix,
}: BaseAwuUsageFromAnalyticsChartProps) {
  // Legend-driven drilldown: when non-null, only these series are shown.
  const [enabledKeys, setEnabledKeys] = useState<string[] | null>(null);

  const handleGroupByChange = (value: AnalyticsGroupBy | undefined) => {
    setGroupBy(value);
    setEnabledKeys(null);
  };

  const handleGroupByCountChange = (value: number) => {
    setGroupByCount(value);
    setEnabledKeys(null);
  };

  const toggleGroup = useCallback((key: string) => {
    setEnabledKeys((prev) => {
      const current = prev ?? [];
      if (current.includes(key)) {
        const next = current.filter((k) => k !== key);
        return next.length === 0 ? null : next;
      }
      return [...current, key];
    });
  }, []);

  const groups = useMemo(() => awuUsageData?.groups ?? [], [awuUsageData]);
  const points = useMemo(() => awuUsageData?.points ?? [], [awuUsageData]);
  const allKeys = useMemo(() => groups.map((g) => g.groupKey), [groups]);

  // Intersect the drilldown selection with the keys actually returned: a series
  // that drops out of the top-N (e.g. after a period change) must not blank the
  // chart, so an empty intersection falls back to showing everything.
  const effectiveEnabledKeys = useMemo(() => {
    if (!enabledKeys) {
      return null;
    }
    const available = enabledKeys.filter((key) => allKeys.includes(key));
    return available.length > 0 ? available : null;
  }, [enabledKeys, allKeys]);

  const chartData = useMemo(
    () =>
      points.map((point) => ({ timestamp: point.timestamp, ...point.values })),
    [points]
  );

  const legendItems: LegendItem[] = useMemo(
    () =>
      groups.map((group) => {
        let label = group.name;
        if (group.groupKey === "others") {
          label = OTHER_LABEL.label;
        }
        const canFilter =
          !!groupBy &&
          group.groupKey !== "others" &&
          group.groupKey !== "total";
        return {
          key: group.groupKey,
          label,
          colorClassName: getColorClassName(groupBy, group.groupKey, allKeys),
          onClick: canFilter ? () => toggleGroup(group.groupKey) : undefined,
          isActive:
            !effectiveEnabledKeys ||
            effectiveEnabledKeys.includes(group.groupKey),
        };
      }),
    [groups, groupBy, allKeys, effectiveEnabledKeys, toggleGroup]
  );

  const visibleKeys = useMemo(
    () =>
      allKeys.filter(
        (key) => !effectiveEnabledKeys || effectiveEnabledKeys.includes(key)
      ),
    [allKeys, effectiveEnabledKeys]
  );

  const exportParams = new URLSearchParams({
    days: days.toString(),
    granularity,
    format: "csv",
  });
  if (groupBy) {
    exportParams.set("groupBy", groupBy);
    exportParams.set("groupByCount", groupByCount.toString());
  }
  // Mirror the legend drilldown: export only the series currently shown.
  if (effectiveEnabledKeys) {
    exportParams.set("series", effectiveEnabledKeys.join(","));
  }
  const csvDownload = useDownloadCsv({
    url: `${exportUrlPrefix}?${exportParams.toString()}`,
    filename: `dust_credit_usage_last_${days}_days.csv`,
    disabled: isAwuUsageLoading || !!isAwuUsageError || chartData.length === 0,
  });

  return (
    <ChartContainer
      title="Credit usage"
      isLoading={isAwuUsageLoading}
      errorMessage={isAwuUsageError ? "Failed to load usage data." : undefined}
      emptyMessage={
        chartData.length === 0 ? "No usage data for this period." : undefined
      }
      additionalControls={
        <div className="flex items-center gap-2">
          {effectiveEnabledKeys && (
            <Button
              label="Clear filters"
              size="xs"
              variant="ghost"
              onClick={() => setEnabledKeys(null)}
            />
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                label={
                  GRANULARITY_OPTIONS.find((o) => o.value === granularity)
                    ?.label ?? "Daily"
                }
                size="xs"
                variant="outline"
                isSelect
              />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {GRANULARITY_OPTIONS.map((o) => (
                <DropdownMenuItem
                  key={o.value}
                  label={o.label}
                  onClick={() => setGranularity(o.value)}
                />
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                label={
                  GROUP_BY_OPTIONS.find((o) => o.value === groupBy)?.label ??
                  "Total"
                }
                size="xs"
                variant="outline"
                isSelect
              />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {GROUP_BY_OPTIONS.map((o) => (
                <DropdownMenuItem
                  key={o.value ?? "total"}
                  label={o.label}
                  onClick={() => handleGroupByChange(o.value)}
                />
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          {groupBy && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  label={`Top ${groupByCount}`}
                  size="xs"
                  variant="outline"
                  isSelect
                />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {TOP_K_OPTIONS.map((value) => (
                  <DropdownMenuItem
                    key={value}
                    label={`Top ${value}`}
                    onClick={() => handleGroupByCountChange(value)}
                  />
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <CsvDownloadButton {...csvDownload} />
        </div>
      }
      height={CHART_HEIGHT}
      legendItems={legendItems}
      isAllowFullScreen
    >
      <BarChart
        data={chartData}
        margin={{ top: 10, right: 30, left: 10, bottom: 20 }}
      >
        <CartesianGrid
          vertical={false}
          className="stroke-border dark:stroke-border-night"
        />
        <XAxis
          dataKey="timestamp"
          type="category"
          className="text-xs text-muted-foreground dark:text-muted-foreground-night"
          tickLine={true}
          axisLine={false}
          tickMargin={8}
          minTickGap={16}
          tickFormatter={(value) => formatTimestamp(value, granularity)}
        />
        <YAxis
          className="text-xs text-muted-foreground dark:text-muted-foreground-night"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          tickFormatter={(value) => formatCreditsCompact(value)}
        />
        <Tooltip
          content={(props: TooltipContentProps<number, string>) => (
            <CreditTooltip
              {...props}
              groupBy={groupBy}
              groups={groups}
              granularity={granularity}
            />
          )}
          cursor={false}
          wrapperStyle={{ outline: "none" }}
          contentStyle={{
            background: "transparent",
            border: "none",
            padding: 0,
            boxShadow: "none",
          }}
        />
        {visibleKeys.map((groupKey) => (
          <Bar
            key={groupKey}
            dataKey={groupKey}
            stackId="usage"
            fill="currentColor"
            className={getColorClassName(groupBy, groupKey, allKeys)}
          />
        ))}
      </BarChart>
    </ChartContainer>
  );
}

export function AwuUsageFromAnalyticsChart({
  workspaceId,
  period,
}: AwuUsageFromAnalyticsChartProps) {
  const [granularity, setGranularity] = useState<Granularity>("day");
  const [groupBy, setGroupBy] = useState<AnalyticsGroupBy | undefined>(
    undefined
  );
  const [groupByCount, setGroupByCount] = useState<number>(5);

  const { awuUsageData, isAwuUsageLoading, isAwuUsageError } =
    useAwuUsageFromAnalytics({
      workspaceId,
      groupBy,
      groupByCount,
      granularity,
      days: period,
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
      days={period}
      exportUrlPrefix={`/api/w/${workspaceId}/analytics/awu-usage-analytics`}
    />
  );
}

function CreditTooltip(
  props: TooltipContentProps<number, string> & {
    groupBy: AnalyticsGroupBy | undefined;
    groups: { groupKey: string; name: string }[];
    granularity: Granularity;
  }
): JSX.Element | null {
  const { active, payload, groupBy, groups, granularity } = props;
  if (!active || !payload || payload.length === 0) {
    return null;
  }
  const data = payload[0]?.payload;
  if (!data) {
    return null;
  }

  const allKeys = groups.map((g) => g.groupKey);
  const groupNameByKey = new Map(groups.map((g) => [g.groupKey, g.name]));
  const entries: { label: string; credits: number; colorClassName: string }[] =
    [];
  for (const p of payload) {
    if (p.value == null || typeof p.value !== "number" || p.value <= 0) {
      continue;
    }
    const groupKey = p.name ?? "";
    let label = groupNameByKey.get(groupKey) ?? groupKey;
    if (groupKey === "others") {
      label = OTHER_LABEL.label;
    }
    entries.push({
      label,
      credits: p.value,
      colorClassName: getColorClassName(groupBy, groupKey, allKeys),
    });
  }

  if (entries.length === 0) {
    return null;
  }

  const rows = entries
    .sort((a, b) => b.credits - a.credits)
    .map((entry) => ({
      label: entry.label,
      value: `${formatCredits(entry.credits)} credits`,
      colorClassName: entry.colorClassName,
    }));

  return (
    <ChartTooltipCard
      title={formatTimestamp(data.timestamp, granularity)}
      rows={rows}
    />
  );
}
