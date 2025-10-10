import { Spinner } from "@dust-tt/sparkle";
import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipProps,
} from "recharts";

import type {
  ObservabilityIntervalType,
  ObservabilityTimeRangeType,
} from "@app/components/agent_builder/observability/constants";
import { useAgentUsageMetrics } from "@app/lib/swr/assistants";
import { ChartTooltipCard } from "@app/components/agent_builder/observability/ChartTooltip";

export function UsageMetricsChart({
  workspaceId,
  agentConfigurationId,
}: {
  workspaceId: string;
  agentConfigurationId: string;
}) {
  const [period, setPeriod] = useState<ObservabilityTimeRangeType>("14d");
  const [interval, setInterval] = useState<ObservabilityIntervalType>("day");

  const days = useMemo(
    () => (period === "7d" ? 7 : period === "14d" ? 14 : 30),
    [period]
  );
  const { usageMetrics, isUsageMetricsLoading, isUsageMetricsError } =
    useAgentUsageMetrics({
      workspaceId,
      agentConfigurationId,
      days,
      interval,
      disabled: !workspaceId || !agentConfigurationId,
    });

  const data = usageMetrics?.points ?? [];

  const palette = {
    messages: "text-blue-500",
    conversations: "text-amber-500",
    activeUsers: "text-emerald-500",
  } as const;

  return (
    <div className="bg-card rounded-lg border border-border p-4">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-medium text-foreground">Usage Metrics</h3>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            {(["7d", "14d", "30d"] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                type="button"
                className={`rounded px-2 py-1 text-xs ${
                  period === p
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {p}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            {(["day", "week"] as const).map((i) => (
              <button
                key={i}
                onClick={() => setInterval(i)}
                type="button"
                className={`rounded px-2 py-1 text-xs ${
                  interval === i
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {i}
              </button>
            ))}
          </div>
        </div>
      </div>
      {isUsageMetricsLoading ? (
        <div className="flex h-[260px] items-center justify-center">
          <Spinner size="lg" />
        </div>
      ) : isUsageMetricsError ? (
        <div className="flex h-[260px] items-center justify-center">
          <p className="text-sm text-muted-foreground">
            Failed to load usage metrics.
          </p>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={260}>
          <LineChart
            data={data}
            margin={{ top: 10, right: 30, left: 10, bottom: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis dataKey="date" className="text-xs text-muted-foreground" />
            <YAxis className="text-xs text-muted-foreground" />
            <Tooltip
              cursor={{ stroke: "hsl(var(--border))", strokeWidth: 1 }}
              content={({ active, payload, label }: TooltipProps<number, string>) => {
                if (!active || !payload || payload.length === 0) return null;
                const row = payload[0].payload as {
                  messages: number;
                  conversations: number;
                  activeUsers: number;
                };
                return (
                  <ChartTooltipCard
                    title={label as string}
                    rows={[
                      { label: "Messages", value: row.messages, colorClass: palette.messages },
                      { label: "Conversations", value: row.conversations, colorClass: palette.conversations },
                      { label: "Active users", value: row.activeUsers, colorClass: palette.activeUsers },
                    ]}
                  />
                );
              }}
            />
            <Line
              dataKey="messages"
              name="Messages"
              stroke="currentColor"
              className={palette.messages}
              strokeWidth={2}
              dot={false}
            />
            <Line
              dataKey="conversations"
              name="Conversations"
              stroke="currentColor"
              className={palette.conversations}
              strokeWidth={2}
              dot={false}
            />
            <Line
              dataKey="activeUsers"
              name="Active users"
              stroke="currentColor"
              className={palette.activeUsers}
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2">
        {(
          [
            { k: "messages", label: "Messages" },
            { k: "conversations", label: "Conversations" },
            { k: "activeUsers", label: "Active users" },
          ] as const
        ).map(({ k, label }) => (
          <div key={k} className="flex items-center gap-2">
            <span
              className={`inline-block h-3 w-3 rounded-sm bg-current ${palette[k]}`}
            />
            <span className="text-sm text-muted-foreground">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
