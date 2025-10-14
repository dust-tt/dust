import { cn, Spinner } from "@dust-tt/sparkle";
import { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TooltipContentProps } from "recharts/types/component/Tooltip";

import { ChartTooltipCard } from "@app/components/agent_builder/observability/ChartTooltip";
import type { ObservabilityTimeRangeType } from "@app/components/agent_builder/observability/constants";
import {
  OBSERVABILITY_PALETTE,
  OBSERVABILITY_TIME_RANGE,
} from "@app/components/agent_builder/observability/constants";
import {
  useAgentLatencyAvgByVersion,
  useAgentToolExecution,
} from "@app/lib/swr/assistants";

const TOOLS_NUMBER_LIMIT = 20;

export function LatencyDistributionChart({
  workspaceId,
  agentConfigurationId,
}: {
  workspaceId: string;
  agentConfigurationId: string;
}) {
  const [period, setPeriod] = useState<ObservabilityTimeRangeType>("14d");
  const days = useMemo(
    () => (period === "7d" ? 7 : period === "14d" ? 14 : 30),
    [period]
  );

  // Fetch tools to populate dropdown (re-using tool execution endpoint)
  const { toolExecution } = useAgentToolExecution({
    workspaceId,
    agentConfigurationId,
    days,
    size: TOOLS_NUMBER_LIMIT,
    disabled: !workspaceId || !agentConfigurationId,
  });
  const availableTools = useMemo(
    () => (toolExecution?.rows ?? []).map((r) => r.tool),
    [toolExecution]
  );
  const [selectedTool, setSelectedTool] = useState<string | null>(null);
  useEffect(() => {
    if (availableTools.length === 0) {
      setSelectedTool(null);
      return;
    }
    // Initialize or keep selection if still present; otherwise set first.
    if (!selectedTool || !availableTools.includes(selectedTool)) {
      setSelectedTool(availableTools[0]);
    }
  }, [availableTools, selectedTool]);

  // Fetch latency averages per version for selected tool
  const {
    latencyAvgByVersion,
    isLatencyAvgByVersionLoading,
    isLatencyAvgByVersionError,
  } = useAgentLatencyAvgByVersion({
    workspaceId,
    agentConfigurationId,
    tool: selectedTool,
    days,
    disabled: !workspaceId || !agentConfigurationId || !selectedTool,
  });

  const versionKeys = useMemo(() => {
    const pts = latencyAvgByVersion?.points ?? [];
    return Array.from(new Set(pts.flatMap((p) => Object.keys(p.versions))));
  }, [latencyAvgByVersion]);

  const chartData = useMemo(() => {
    const pts = latencyAvgByVersion?.points ?? [];
    return pts.map((p) => ({ date: p.date, ...p.versions }));
  }, [latencyAvgByVersion]);

  return (
    <div className="bg-card rounded-lg border border-border p-4">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-medium text-foreground">
          Latency (avg) by Version
        </h3>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            {OBSERVABILITY_TIME_RANGE.map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                type="button"
                className={cn(
                  "rounded px-2 py-1 text-xs",
                  period === p
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {p}
              </button>
            ))}
          </div>
          <select
            value={selectedTool ?? ""}
            onChange={(e) => setSelectedTool(e.target.value || null)}
            className="bg-card rounded border border-border px-2 py-1 text-xs text-foreground"
            disabled={availableTools.length === 0}
          >
            <option value="" disabled>
              Select tool
            </option>
            {availableTools.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
      </div>
      {isLatencyAvgByVersionLoading ? (
        <div className="flex h-[260px] items-center justify-center">
          <Spinner size="lg" />
        </div>
      ) : isLatencyAvgByVersionError ? (
        <div className="flex h-[260px] items-center justify-center">
          <p className="text-sm text-muted-foreground">
            Failed to load latency metrics.
          </p>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={260}>
          <LineChart
            data={chartData}
            margin={{ top: 10, right: 30, left: 10, bottom: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis dataKey="date" className="text-xs text-muted-foreground" />
            <YAxis
              className="text-xs text-muted-foreground"
              label={{ value: "ms", angle: -90, position: "insideLeft" }}
            />
            <Tooltip
              cursor={{ stroke: "hsl(var(--border))", strokeWidth: 1 }}
              content={(props: TooltipContentProps<number, string>) => {
                const { active, payload, label } = props;
                if (!active || !payload || payload.length === 0) {
                  return null;
                }
                type Item = NonNullable<typeof payload>[number];
                const entries = payload.map((p: Item, i: number) => ({
                  label: String(p.name ?? p.dataKey),
                  value: p.value ?? 0,
                  colorClass:
                    OBSERVABILITY_PALETTE[i % OBSERVABILITY_PALETTE.length],
                }));
                return (
                  <ChartTooltipCard
                    title={String(label ?? "")}
                    rows={entries}
                  />
                );
              }}
            />
            {versionKeys.map((v, i) => (
              <Line
                key={v}
                dataKey={v}
                name={`v${v}`}
                stroke="currentColor"
                className={
                  OBSERVABILITY_PALETTE[i % OBSERVABILITY_PALETTE.length]
                }
                strokeWidth={2}
                dot={false}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2">
        {versionKeys.map((v, i) => (
          <div key={v} className="flex items-center gap-2">
            <span
              className={`inline-block h-3 w-3 rounded-sm bg-current ${OBSERVABILITY_PALETTE[i % OBSERVABILITY_PALETTE.length]}`}
            />
            <span className="text-sm text-muted-foreground">v{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
