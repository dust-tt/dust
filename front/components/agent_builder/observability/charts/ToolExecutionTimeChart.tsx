import {
  Button,
  ButtonsSwitch,
  ButtonsSwitchList,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@dust-tt/sparkle";
import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from "recharts";
import type { TooltipContentProps } from "recharts/types/component/Tooltip";

import {
  CHART_HEIGHT,
  MAX_TOOLS_DISPLAYED,
  TOOL_EXECUTION_TIME_LEGEND,
  TOOL_EXECUTION_TIME_PALETTE,
} from "@app/components/agent_builder/observability/constants";
import { useToolLatencyData } from "@app/components/agent_builder/observability/hooks";
import { useObservabilityContext } from "@app/components/agent_builder/observability/ObservabilityContext";
import type { ToolLatencyDatum } from "@app/components/agent_builder/observability/types";
import { ChartContainer } from "@app/components/charts/ChartContainer";
import { legendFromConstant } from "@app/components/charts/ChartLegend";
import { RoundedBarShape } from "@app/components/charts/ChartShapes";
import { ChartTooltipCard } from "@app/components/charts/ChartTooltip";
import type { ToolLatencyView } from "@app/lib/api/assistant/observability/tool_latency";

function formatDurationMs(durationMs: number): string {
  if (durationMs >= 1000) {
    const durationSeconds = durationMs / 1000;
    return `${durationSeconds.toFixed(1)}s`;
  }
  return `${Math.round(durationMs)}ms`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isToolLatencyDatum(data: unknown): data is ToolLatencyDatum {
  if (!isRecord(data)) {
    return false;
  }

  return (
    typeof data.name === "string" &&
    typeof data.label === "string" &&
    typeof data.count === "number" &&
    typeof data.avgLatencyMs === "number" &&
    typeof data.p50LatencyMs === "number" &&
    typeof data.p95LatencyMs === "number"
  );
}

function ToolExecutionTimeTooltip(
  props: TooltipContentProps<number, string>
): JSX.Element | null {
  const { active, payload } = props;
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  const first = payload[0];
  if (!first?.payload || !isToolLatencyDatum(first.payload)) {
    return null;
  }

  const row = first.payload;

  return (
    <ChartTooltipCard
      title={row.label}
      rows={[
        {
          label: "Average",
          value: formatDurationMs(row.avgLatencyMs),
          colorClassName: TOOL_EXECUTION_TIME_PALETTE.avgLatencyMs,
        },
        {
          label: "P50",
          value: formatDurationMs(row.p50LatencyMs),
          colorClassName: TOOL_EXECUTION_TIME_PALETTE.p50LatencyMs,
        },
        {
          label: "P95",
          value: formatDurationMs(row.p95LatencyMs),
          colorClassName: TOOL_EXECUTION_TIME_PALETTE.p95LatencyMs,
        },
      ]}
      footer={`Executions: ${row.count}`}
    />
  );
}

interface ToolExecutionTimeChartProps {
  workspaceId: string;
  agentConfigurationId: string;
  isCustomAgent: boolean;
}

export function ToolExecutionTimeChart({
  workspaceId,
  agentConfigurationId,
  isCustomAgent,
}: ToolExecutionTimeChartProps): JSX.Element {
  const { period, mode, selectedVersion } = useObservabilityContext();
  const [view, setView] = useState<ToolLatencyView>("server");
  const [selectedServerName, setSelectedServerName] = useState<string | null>(
    null
  );

  const isVersionMode = isCustomAgent && mode === "version";
  const filterVersion = isVersionMode ? selectedVersion?.version : undefined;
  const isSelectionReady = !isVersionMode || !!selectedVersion;
  const isBaseDisabled =
    !workspaceId || !agentConfigurationId || !isSelectionReady;

  const serverLatency = useToolLatencyData({
    workspaceId,
    agentConfigurationId,
    period,
    view: "server",
    filterVersion,
    disabled: isBaseDisabled,
  });

  const serverRows = serverLatency.data;
  const serverOptions = serverRows.map((row) => ({
    name: row.name,
    label: row.label,
  }));

  useEffect(() => {
    if (view !== "tool") {
      return;
    }

    if (serverRows.length === 0) {
      if (selectedServerName !== null) {
        setSelectedServerName(null);
      }
      return;
    }

    const hasSelectedServer = selectedServerName
      ? serverRows.some((server) => server.name === selectedServerName)
      : false;

    if (!selectedServerName || !hasSelectedServer) {
      setSelectedServerName(serverRows[0].name);
    }
  }, [view, serverRows, selectedServerName, setSelectedServerName]);

  const toolLatency = useToolLatencyData({
    workspaceId,
    agentConfigurationId,
    period,
    view: "tool",
    filterVersion,
    serverName: selectedServerName,
    disabled: isBaseDisabled || view !== "tool",
  });

  const activeData = view === "server" ? serverLatency.data : toolLatency.data;
  const displayData = activeData.slice(0, MAX_TOOLS_DISPLAYED);

  const isLoading =
    view === "server"
      ? serverLatency.isLoading
      : serverLatency.isLoading || toolLatency.isLoading;

  const errorMessage =
    view === "server"
      ? serverLatency.errorMessage
      : (toolLatency.errorMessage ?? serverLatency.errorMessage);

  let emptyMessage: string | undefined;
  if (view === "server") {
    if (displayData.length === 0) {
      emptyMessage = "No successful tool executions for this selection.";
    }
  } else if (serverRows.length === 0) {
    emptyMessage = "No successful tool executions for this selection.";
  } else if (displayData.length === 0) {
    emptyMessage = "No successful tool executions for this server.";
  }

  const legendItems = legendFromConstant(
    TOOL_EXECUTION_TIME_LEGEND,
    TOOL_EXECUTION_TIME_PALETTE
  );

  const selectedServerLabel =
    serverOptions.find((server) => server.name === selectedServerName)?.label ??
    (serverLatency.isLoading ? "Loading" : "Select server");

  const xAxisLabel = view === "server" ? "Server" : "Tool";

  return (
    <ChartContainer
      title="Tool execution time"
      description="Average, p50, and p95 runtime for successful tool calls."
      isLoading={isLoading}
      errorMessage={errorMessage}
      emptyMessage={emptyMessage}
      height={CHART_HEIGHT}
      legendItems={legendItems}
      additionalControls={
        <div className="flex items-center gap-2">
          <ButtonsSwitchList defaultValue={view} size="xs">
            <ButtonsSwitch
              value="server"
              label="By capability"
              onClick={() => setView("server")}
            />
            <ButtonsSwitch
              value="tool"
              label="By tool"
              onClick={() => setView("tool")}
            />
          </ButtonsSwitchList>
          {view === "tool" && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  label={selectedServerLabel}
                  size="xs"
                  variant="outline"
                  isSelect
                  disabled={serverOptions.length === 0}
                />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel label="Capability" />
                {serverOptions.map((server) => (
                  <DropdownMenuItem
                    key={server.name}
                    label={server.label}
                    onClick={() => setSelectedServerName(server.name)}
                  />
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      }
    >
      <BarChart
        data={displayData}
        margin={{ top: 10, right: 30, left: 10, bottom: 20 }}
      >
        <CartesianGrid
          vertical={false}
          className="stroke-border dark:stroke-border-night"
        />
        <XAxis
          dataKey="label"
          className="text-xs text-muted-foreground dark:text-muted-foreground-night"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={16}
          label={{
            value: xAxisLabel,
            position: "insideBottom",
            offset: -8,
            style: { textAnchor: "middle" },
          }}
        />
        <YAxis
          className="text-xs text-muted-foreground dark:text-muted-foreground-night"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          tickFormatter={formatDurationMs}
        />
        <Tooltip
          content={ToolExecutionTimeTooltip}
          cursor={false}
          wrapperStyle={{ outline: "none", zIndex: 50 }}
          contentStyle={{
            background: "transparent",
            border: "none",
            padding: 0,
            boxShadow: "none",
          }}
        />
        <Bar
          dataKey="p50LatencyMs"
          name="P50"
          fill="currentColor"
          className={TOOL_EXECUTION_TIME_PALETTE.p50LatencyMs}
          shape={<RoundedBarShape />}
        />
        <Bar
          dataKey="avgLatencyMs"
          name="Average"
          fill="currentColor"
          className={TOOL_EXECUTION_TIME_PALETTE.avgLatencyMs}
          shape={<RoundedBarShape />}
        />
        <Bar
          dataKey="p95LatencyMs"
          name="P95"
          fill="currentColor"
          className={TOOL_EXECUTION_TIME_PALETTE.p95LatencyMs}
          shape={<RoundedBarShape />}
        />
      </BarChart>
    </ChartContainer>
  );
}
