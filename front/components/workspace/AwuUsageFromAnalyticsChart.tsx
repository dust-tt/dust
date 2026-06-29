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
  Chip,
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
  userFilter: AnalyticsEntityFilter | null;
  agentFilter: AnalyticsEntityFilter | null;
  onUserFilterChange: (filter: AnalyticsEntityFilter | null) => void;
  onAgentFilterChange: (filter: AnalyticsEntityFilter | null) => void;
}

export type Granularity = "day" | "week" | "month";
export type AnalyticsGroupBy = "usage_type" | "agent" | "user" | "origin";

type GroupByOption = { value: AnalyticsGroupBy | undefined; label: string };

// A sticky scope filter on the credit usage chart: restricts every series to a
// single user or agent (by sId). Persists across groupBy changes so that, e.g.,
// scoping to a user then switching to "By Agent" shows that user's agents.
export interface AnalyticsEntityFilter {
  id: string;
  name: string;
}

const GROUP_BY_OPTIONS: GroupByOption[] = [
  { value: undefined, label: "Total" },
  { value: "usage_type", label: "By Usage Type" },
  { value: "agent", label: "By Agent" },
  { value: "user", label: "By User" },
  { value: "origin", label: "By Source" },
];

// "By User" is redundant when the chart is already scoped to a single user.
const PERSONAL_GROUP_BY_OPTIONS: GroupByOption[] = GROUP_BY_OPTIONS.filter(
  (o) => o.value !== "user"
);

// Personal usage chart covers a fixed trailing window (no period selector).
const PERSONAL_USAGE_DAYS = 30;

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
  // Available group-by options; defaults to the full workspace-wide list.
  groupByOptions?: GroupByOption[];
  // Sticky scope filters. When set, the chart is restricted to that user/agent
  // and a removable chip is shown. Legend clicks in "user"/"agent" mode set the
  // matching filter when the corresponding setter is provided.
  userFilter?: AnalyticsEntityFilter | null;
  agentFilter?: AnalyticsEntityFilter | null;
  onUserFilterChange?: (filter: AnalyticsEntityFilter | null) => void;
  onAgentFilterChange?: (filter: AnalyticsEntityFilter | null) => void;
}

interface UsageChartControlsProps {
  granularity: Granularity;
  setGranularity: (v: Granularity) => void;
  groupBy: AnalyticsGroupBy | undefined;
  onGroupByChange: (v: AnalyticsGroupBy | undefined) => void;
  groupByCount: number;
  onGroupByCountChange: (v: number) => void;
  groupByOptions: GroupByOption[];
  userFilter?: AnalyticsEntityFilter | null;
  agentFilter?: AnalyticsEntityFilter | null;
  onUserFilterChange?: (filter: AnalyticsEntityFilter | null) => void;
  onAgentFilterChange?: (filter: AnalyticsEntityFilter | null) => void;
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
  userFilter,
  agentFilter,
  onUserFilterChange,
  onAgentFilterChange,
  hasDrilldown,
  onClearDrilldown,
  csvDownload,
}: UsageChartControlsProps) {
  return (
    <div className="flex items-center gap-2">
      {userFilter && (
        <Chip
          size="xs"
          label={`User: ${userFilter.name}`}
          onRemove={() => onUserFilterChange?.(null)}
        />
      )}
      {agentFilter && (
        <Chip
          size="xs"
          label={`Agent: ${agentFilter.name}`}
          onRemove={() => onAgentFilterChange?.(null)}
        />
      )}
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
}

function UsageChartBars({
  chartData,
  visibleKeys,
  allKeys,
  groupBy,
  groups,
  granularity,
}: UsageChartBarsProps) {
  return (
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
  );
}

interface UseUsageLegendItemsParams {
  groups: { groupKey: string; name: string }[];
  groupBy: AnalyticsGroupBy | undefined;
  allKeys: string[];
  effectiveEnabledKeys: string[] | null;
  toggleGroup: (key: string) => void;
  userFilter?: AnalyticsEntityFilter | null;
  agentFilter?: AnalyticsEntityFilter | null;
  onUserFilterChange?: (filter: AnalyticsEntityFilter | null) => void;
  onAgentFilterChange?: (filter: AnalyticsEntityFilter | null) => void;
}

function useUsageLegendItems({
  groups,
  groupBy,
  allKeys,
  effectiveEnabledKeys,
  toggleGroup,
  userFilter,
  agentFilter,
  onUserFilterChange,
  onAgentFilterChange,
}: UseUsageLegendItemsParams): LegendItem[] {
  // In "user"/"agent" mode, legend clicks set the sticky scope filter (a server
  // refetch) rather than toggling client-side series visibility, so the choice
  // survives groupBy changes.
  const userScopeMode = groupBy === "user" && !!onUserFilterChange;
  const agentScopeMode = groupBy === "agent" && !!onAgentFilterChange;

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

        if (canFilter && userScopeMode) {
          const isSelected = userFilter?.id === group.groupKey;
          return {
            key: group.groupKey,
            label,
            colorClassName,
            onClick: () =>
              onUserFilterChange?.(
                isSelected ? null : { id: group.groupKey, name: group.name }
              ),
            isActive: !userFilter || isSelected,
          };
        }

        if (canFilter && agentScopeMode) {
          const isSelected = agentFilter?.id === group.groupKey;
          return {
            key: group.groupKey,
            label,
            colorClassName,
            onClick: () =>
              onAgentFilterChange?.(
                isSelected ? null : { id: group.groupKey, name: group.name }
              ),
            isActive: !agentFilter || isSelected,
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
      userScopeMode,
      agentScopeMode,
      userFilter,
      agentFilter,
      onUserFilterChange,
      onAgentFilterChange,
    ]
  );
}

interface BuildExportUrlParams {
  exportUrlPrefix: string;
  days: number;
  granularity: Granularity;
  groupBy: AnalyticsGroupBy | undefined;
  groupByCount: number;
  userFilter?: AnalyticsEntityFilter | null;
  agentFilter?: AnalyticsEntityFilter | null;
  effectiveEnabledKeys: string[] | null;
}

function buildExportUrl({
  exportUrlPrefix,
  days,
  granularity,
  groupBy,
  groupByCount,
  userFilter,
  agentFilter,
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
  // Mirror the sticky scope filters so the export matches the chart.
  if (userFilter) {
    exportParams.set("userId", userFilter.id);
  }
  if (agentFilter) {
    exportParams.set("agentId", agentFilter.id);
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
  userFilter,
  agentFilter,
  onUserFilterChange,
  onAgentFilterChange,
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
    userFilter,
    agentFilter,
    onUserFilterChange,
    onAgentFilterChange,
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
      userFilter,
      agentFilter,
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
          userFilter={userFilter}
          agentFilter={agentFilter}
          onUserFilterChange={onUserFilterChange}
          onAgentFilterChange={onAgentFilterChange}
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
      />
    </ChartContainer>
  );
}

export function AwuUsageFromAnalyticsChart({
  workspaceId,
  period,
  userFilter,
  agentFilter,
  onUserFilterChange,
  onAgentFilterChange,
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
      userId: userFilter?.id,
      agentId: agentFilter?.id,
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
      userFilter={userFilter}
      agentFilter={agentFilter}
      onUserFilterChange={onUserFilterChange}
      onAgentFilterChange={onAgentFilterChange}
    />
  );
}

interface MyAwuUsageFromAnalyticsChartProps {
  workspaceId: string;
  disabled?: boolean;
}

// Personal credit usage chart scoped to the authenticated user. Same chart as
// the workspace-wide analytics one, but fetches from the user-scoped endpoint so
// any member can track their own usage.
export function MyAwuUsageFromAnalyticsChart({
  workspaceId,
  disabled,
}: MyAwuUsageFromAnalyticsChartProps) {
  const [granularity, setGranularity] = useState<Granularity>("day");
  const [groupBy, setGroupBy] = useState<AnalyticsGroupBy | undefined>(
    undefined
  );
  const [groupByCount, setGroupByCount] = useState<number>(5);

  const exportUrlPrefix = `/api/w/${workspaceId}/credits/my-usage-analytics`;

  const { awuUsageData, isAwuUsageLoading, isAwuUsageError } =
    useAwuUsageFromAnalytics({
      workspaceId,
      groupBy,
      groupByCount,
      granularity,
      days: PERSONAL_USAGE_DAYS,
      disabled,
      urlPrefix: exportUrlPrefix,
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
      days={PERSONAL_USAGE_DAYS}
      exportUrlPrefix={exportUrlPrefix}
      groupByOptions={PERSONAL_GROUP_BY_OPTIONS}
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
