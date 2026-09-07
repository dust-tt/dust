import {
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
import { CHART_HEIGHT, CHART_MARGIN } from "@app/components/charts/constants";
import type { AnalyticsFilter } from "@app/components/workspace/analytics/analyticsFilter";
import {
  isScopeDimension,
  removeScopeEntity,
  SCOPE_DIMENSION_LABEL,
  SCOPE_DIMENSIONS,
  scopeFilterToIds,
  toggleScopeEntity,
} from "@app/components/workspace/analytics/analyticsFilter";
import { CsvDownloadButton } from "@app/components/workspace/analytics/CsvDownloadButton";
import { useDownloadCsv } from "@app/hooks/useDownloadCsv";
import type { AwuUsageAnalyticsResponse } from "@app/lib/api/analytics/awu_usage_analytics";
import { formatCredits, formatCreditsCompact } from "@app/lib/client/credits";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import { ONE_DAY_MS } from "@app/types/shared/utils/date_utils";
import {
  Button,
  Chip,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@dust-tt/sparkle";
import type { ReactNode } from "react";
import { useCallback, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from "recharts";
import type { TooltipContentProps } from "recharts/types/component/Tooltip";

export type Granularity = "day" | "week" | "month";
export type AnalyticsGroupBy =
  | "usage_type"
  | "agent"
  | "user"
  | "origin"
  | "api_key"
  | "model";

type GroupByOption = { value: AnalyticsGroupBy | undefined; label: string };

const GROUP_BY_OPTIONS: GroupByOption[] = [
  { value: undefined, label: "Total" },
  { value: "usage_type", label: "By Usage Type" },
  { value: "agent", label: "By Agent" },
  { value: "user", label: "By User" },
  { value: "origin", label: "By Source" },
  { value: "api_key", label: "By API Key" },
  { value: "model", label: "By Model" },
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

function formatUtcMonthDay(date: Date): string {
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

// Weekly and monthly buckets slide with the trailing window, so the first and
// last buckets are usually truncated (e.g. on Jul 6, "last 30 days" covers
// "Jun 6 - 30" and "Jul 1 - 6"). Label buckets with the exact dates covered,
// clamped to the window, to avoid suggesting full calendar periods.
export function formatBucketRange(
  bucketStartMs: number,
  granularity: "week" | "month",
  days: number
): string {
  const now = new Date();
  const todayMs = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate()
  );
  // Mirrors the server-side window from daysToInstantRange(days, "UTC").
  const windowStartMs = todayMs - (days - 1) * ONE_DAY_MS;

  const bucketStart = new Date(bucketStartMs);
  const bucketEndMs =
    granularity === "week"
      ? bucketStartMs + 6 * ONE_DAY_MS
      : Date.UTC(
          bucketStart.getUTCFullYear(),
          bucketStart.getUTCMonth() + 1,
          0
        );

  const startDate = new Date(Math.max(bucketStartMs, windowStartMs));
  const endDate = new Date(Math.min(bucketEndMs, todayMs));

  if (startDate.getTime() >= endDate.getTime()) {
    // Single day like "Jun 30"
    return formatUtcMonthDay(startDate);
  }
  if (
    startDate.getUTCFullYear() === endDate.getUTCFullYear() &&
    startDate.getUTCMonth() === endDate.getUTCMonth()
  ) {
    // Several days in same month like "Jun 6 - 30"
    return `${formatUtcMonthDay(startDate)} - ${endDate.getUTCDate()}`;
  }
  // Cross months period like "Jun 29 - July 5"
  return `${formatUtcMonthDay(startDate)} - ${formatUtcMonthDay(endDate)}`;
}

function formatTimestamp(
  timestamp: number,
  granularity: Granularity,
  days: number
): string {
  switch (granularity) {
    case "day":
      return formatUtcMonthDay(new Date(timestamp));
    case "week":
    case "month":
      return formatBucketRange(timestamp, granularity, days);
    default:
      assertNeverAndIgnore(granularity);
      return formatUtcMonthDay(new Date(timestamp));
  }
}

interface BaseAwuUsageFromAnalyticsChartProps {
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
  // Available group-by options; defaults to the full workspace-wide list.
  groupByOptions?: GroupByOption[];
  // Sticky per-dimension scope filter. When set, the chart is restricted to the
  // selected entities and a removable chip is shown per selection. Legend clicks
  // in a scope-dimension groupBy (agent/user/origin) toggle the matching
  // selection when onFilterChange is provided.
  filter?: AnalyticsFilter;
  onFilterChange?: (next: AnalyticsFilter) => void;
  // Rendered right of the filter chips. Injected by the workspace chart only:
  // the dropdown needs the workspace auth context to list filterable entities.
  filterDropdown?: ReactNode;
}

interface UsageChartControlsProps {
  granularity: Granularity;
  setGranularity: (v: Granularity) => void;
  groupBy: AnalyticsGroupBy | undefined;
  onGroupByChange: (v: AnalyticsGroupBy | undefined) => void;
  groupByCount: number;
  onGroupByCountChange: (v: number) => void;
  groupByOptions: GroupByOption[];
  filter?: AnalyticsFilter;
  onFilterChange?: (next: AnalyticsFilter) => void;
  filterDropdown?: ReactNode;
  hasDrilldown: boolean;
  onClearDrilldown: () => void;
  csvDownload: ReturnType<typeof useDownloadCsv>;
}

function UsageChartControls({
  granularity,
  setGranularity,
  groupBy,
  onGroupByChange,
  groupByCount,
  onGroupByCountChange,
  groupByOptions,
  filter,
  onFilterChange,
  filterDropdown,
  hasDrilldown,
  onClearDrilldown,
  csvDownload,
}: UsageChartControlsProps) {
  return (
    <div className="flex items-center gap-2">
      {filter && onFilterChange && (
        <div className="flex flex-wrap items-center justify-end gap-2">
          {SCOPE_DIMENSIONS.flatMap((dimension) =>
            (filter[dimension] ?? []).map((entity) => (
              <Chip
                key={`${dimension}:${entity.id}`}
                size="xs"
                label={`${SCOPE_DIMENSION_LABEL[dimension]}: ${entity.name}`}
                onRemove={() =>
                  onFilterChange(
                    removeScopeEntity(filter, dimension, entity.id)
                  )
                }
              />
            ))
          )}
        </div>
      )}
      {filterDropdown}
      {hasDrilldown && (
        <Button
          label="Clear filters"
          size="xs"
          variant="ghost"
          onClick={onClearDrilldown}
        />
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            label={
              GRANULARITY_OPTIONS.find((o) => o.value === granularity)?.label ??
              "Daily"
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
              groupByOptions.find((o) => o.value === groupBy)?.label ?? "Total"
            }
            size="xs"
            variant="outline"
            isSelect
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {groupByOptions.map((o) => (
            <DropdownMenuItem
              key={o.value ?? "total"}
              label={o.label}
              onClick={() => onGroupByChange(o.value)}
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
                onClick={() => onGroupByCountChange(value)}
              />
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      <CsvDownloadButton {...csvDownload} />
    </div>
  );
}

interface UsageChartBarsProps {
  chartData: { timestamp: number; [key: string]: number }[];
  visibleKeys: string[];
  allKeys: string[];
  groupBy: AnalyticsGroupBy | undefined;
  groups: { groupKey: string; name: string }[];
  granularity: Granularity;
  days: number;
  // Injected by the parent ResponsiveContainer (via cloneElement) and forwarded
  // to BarChart. Without forwarding, BarChart has no dimensions and renders
  // blank.
  width?: number;
  height?: number;
}

function UsageChartBars({
  chartData,
  visibleKeys,
  allKeys,
  groupBy,
  groups,
  granularity,
  days,
  width,
  height,
}: UsageChartBarsProps) {
  return (
    <BarChart
      data={chartData}
      width={width}
      height={height}
      margin={CHART_MARGIN}
    >
      <CartesianGrid vertical={false} className="stroke-border" />
      <XAxis
        dataKey="timestamp"
        type="category"
        className="text-xs text-muted-foreground"
        tickLine={true}
        axisLine={false}
        tickMargin={8}
        minTickGap={16}
        tickFormatter={(value) => formatTimestamp(value, granularity, days)}
      />
      <YAxis
        className="text-xs text-muted-foreground"
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
            days={days}
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
  );
}

interface UseUsageLegendItemsParams {
  groups: { groupKey: string; name: string }[];
  groupBy: AnalyticsGroupBy | undefined;
  allKeys: string[];
  effectiveEnabledKeys: string[] | null;
  toggleGroup: (key: string) => void;
  filter?: AnalyticsFilter;
  onFilterChange?: (next: AnalyticsFilter) => void;
}

function useUsageLegendItems({
  groups,
  groupBy,
  allKeys,
  effectiveEnabledKeys,
  toggleGroup,
  filter,
  onFilterChange,
}: UseUsageLegendItemsParams): LegendItem[] {
  const scopeDimension =
    isScopeDimension(groupBy) && filter && onFilterChange ? groupBy : null;

  return useMemo(
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
        const colorClassName = getColorClassName(
          groupBy,
          group.groupKey,
          allKeys
        );

        if (canFilter && scopeDimension && filter && onFilterChange) {
          const selected = filter[scopeDimension] ?? [];
          const isSelected = selected.some((e) => e.id === group.groupKey);
          return {
            key: group.groupKey,
            label,
            colorClassName,
            onClick: () =>
              onFilterChange(
                toggleScopeEntity(filter, scopeDimension, {
                  id: group.groupKey,
                  name: group.name,
                })
              ),
            isActive: selected.length === 0 || isSelected,
          };
        }

        return {
          key: group.groupKey,
          label,
          colorClassName,
          onClick: canFilter ? () => toggleGroup(group.groupKey) : undefined,
          isActive:
            !effectiveEnabledKeys ||
            effectiveEnabledKeys.includes(group.groupKey),
        };
      }),
    [
      groups,
      groupBy,
      allKeys,
      effectiveEnabledKeys,
      toggleGroup,
      scopeDimension,
      filter,
      onFilterChange,
    ]
  );
}

interface BuildExportUrlParams {
  exportUrlPrefix: string;
  days: number;
  granularity: Granularity;
  groupBy: AnalyticsGroupBy | undefined;
  groupByCount: number;
  filter?: AnalyticsFilter;
  effectiveEnabledKeys: string[] | null;
}

function buildExportUrl({
  exportUrlPrefix,
  days,
  granularity,
  groupBy,
  groupByCount,
  filter,
  effectiveEnabledKeys,
}: BuildExportUrlParams): string {
  const exportParams = new URLSearchParams({
    days: days.toString(),
    granularity,
    format: "csv",
  });
  if (groupBy) {
    exportParams.set("groupBy", groupBy);
    exportParams.set("groupByCount", groupByCount.toString());
  }
  // Mirror the sticky scope filter so the export matches the chart.
  if (filter) {
    const ids = scopeFilterToIds(filter);
    if (Object.keys(ids).length > 0) {
      exportParams.set("filter", JSON.stringify(ids));
    }
  }
  // Mirror the legend drilldown: export only the series currently shown.
  if (effectiveEnabledKeys) {
    exportParams.set("series", effectiveEnabledKeys.join(","));
  }
  return `${exportUrlPrefix}?${exportParams.toString()}`;
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
  groupByOptions = GROUP_BY_OPTIONS,
  filter,
  onFilterChange,
  filterDropdown,
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

  const legendItems = useUsageLegendItems({
    groups,
    groupBy,
    allKeys,
    effectiveEnabledKeys,
    toggleGroup,
    filter,
    onFilterChange,
  });

  const visibleKeys = useMemo(
    () =>
      allKeys.filter(
        (key) => !effectiveEnabledKeys || effectiveEnabledKeys.includes(key)
      ),
    [allKeys, effectiveEnabledKeys]
  );

  const csvDownload = useDownloadCsv({
    url: buildExportUrl({
      exportUrlPrefix,
      days,
      granularity,
      groupBy,
      groupByCount,
      filter,
      effectiveEnabledKeys,
    }),
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
        <UsageChartControls
          granularity={granularity}
          setGranularity={setGranularity}
          groupBy={groupBy}
          onGroupByChange={handleGroupByChange}
          groupByCount={groupByCount}
          onGroupByCountChange={handleGroupByCountChange}
          groupByOptions={groupByOptions}
          filter={filter}
          onFilterChange={onFilterChange}
          filterDropdown={filterDropdown}
          hasDrilldown={!!effectiveEnabledKeys}
          onClearDrilldown={() => setEnabledKeys(null)}
          csvDownload={csvDownload}
        />
      }
      height={CHART_HEIGHT}
      legendItems={legendItems}
      isAllowFullScreen
    >
      <UsageChartBars
        chartData={chartData}
        visibleKeys={visibleKeys}
        allKeys={allKeys}
        groupBy={groupBy}
        groups={groups}
        granularity={granularity}
        days={days}
      />
    </ChartContainer>
  );
}

function CreditTooltip(
  props: TooltipContentProps<number, string> & {
    groupBy: AnalyticsGroupBy | undefined;
    groups: { groupKey: string; name: string }[];
    granularity: Granularity;
    days: number;
  }
): JSX.Element | null {
  const { active, payload, groupBy, groups, granularity, days } = props;
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
      title={formatTimestamp(data.timestamp, granularity, days)}
      rows={rows}
    />
  );
}
