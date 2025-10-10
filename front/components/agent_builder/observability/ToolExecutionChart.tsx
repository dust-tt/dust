import { Spinner } from "@dust-tt/sparkle";
import { ChartTooltipCard } from "@app/components/agent_builder/observability/ChartTooltip";
import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipProps,
} from "recharts";

import type { ObservabilityTimeRangeType } from "@app/components/agent_builder/observability/constants";
import { useAgentToolExecution } from "@app/lib/swr/assistants";

export function ToolExecutionChart({
  workspaceId,
  agentConfigurationId,
}: {
  workspaceId: string;
  agentConfigurationId: string;
}) {
  const [range, setRange] = useState<ObservabilityTimeRangeType>("14d");
  const days = useMemo(
    () => (range === "7d" ? 7 : range === "14d" ? 14 : 30),
    [range]
  );

  const { toolExecution, isToolExecutionLoading, isToolExecutionError } =
    useAgentToolExecution({
      workspaceId,
      agentConfigurationId,
      days,
      size: 10,
      disabled: !workspaceId || !agentConfigurationId,
    });

  const sortedTop = useMemo(() => {
    const rows = toolExecution?.rows ?? [];
    return [...rows].sort((a, b) => b.total - a.total).slice(0, 10);
  }, [toolExecution]);

  function CustomTooltip({ active, payload }: TooltipProps<number, string>) {
    if (!active || !payload || payload.length === 0) return null;

    const row = payload[0].payload as { tool: string; success: number; failure: number };
    const total = (row.success ?? 0) + (row.failure ?? 0);
    const successPct = total ? Math.round((row.success / total) * 100) : 0;
    const failurePct = total ? Math.round((row.failure / total) * 100) : 0;

    return (
      <ChartTooltipCard
        title={row.tool}
        rows={[
          { label: "Success", value: row.success, percent: successPct, colorClass: "text-emerald-500" },
          { label: "Failure", value: row.failure, percent: failurePct, colorClass: "text-rose-500" },
        ]}
        footer={`Total: ${total}`}
      />
    );
  }

  return (
    <div className="bg-card rounded-lg border border-border p-4">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-medium text-foreground">Tool Executions</h3>
        <div className="flex items-center gap-2">
          {(["7d", "14d", "30d"] as const).map((p) => (
            <button
              key={p}
              onClick={() => setRange(p)}
              type="button"
              className={`rounded px-2 py-1 text-xs ${
                range === p
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>
      {isToolExecutionLoading ? (
        <div className="flex h-[260px] items-center justify-center">
          <Spinner size="lg" />
        </div>
      ) : isToolExecutionError ? (
        <div className="flex h-[260px] items-center justify-center">
          <p className="text-sm text-muted-foreground">
            Failed to load tool executions.
          </p>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={260}>
          <BarChart
            data={sortedTop}
            layout="vertical"
            margin={{ top: 10, right: 30, left: 10, bottom: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis type="number" className="text-xs text-muted-foreground" />
            <YAxis
              dataKey="tool"
              type="category"
              width={180}
              className="text-xs text-muted-foreground"
            />
          <Tooltip
            cursor={{ fill: "rgba(0,0,0,0.04)" }}
            content={<CustomTooltip />}
          />
            <Bar
              dataKey="success"
              stackId="a"
              name="Success"
              fill="currentColor"
              className="text-emerald-500"
            />
            <Bar
              dataKey="failure"
              stackId="a"
              name="Failure"
              fill="currentColor"
              className="text-rose-500"
            />
          </BarChart>
        </ResponsiveContainer>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2">
        <div className="flex items-center gap-2">
          <span className="inline-block h-3 w-3 rounded-sm bg-current text-emerald-500" />
          <span className="text-sm text-muted-foreground">Success</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-block h-3 w-3 rounded-sm bg-current text-rose-500" />
          <span className="text-sm text-muted-foreground">Failure</span>
        </div>
      </div>
    </div>
  );
}
