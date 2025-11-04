import { Chip } from "@dust-tt/sparkle";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TooltipContentProps } from "recharts/types/component/Tooltip";

import {
  CHART_HEIGHT,
  ERROR_RATE_LEGEND,
  ERROR_RATE_PALETTE,
} from "@app/components/agent_builder/observability/constants";
import { useObservability } from "@app/components/agent_builder/observability/ObservabilityContext";
import { ChartContainer } from "@app/components/agent_builder/observability/shared/ChartContainer";
import { ChartLegend } from "@app/components/agent_builder/observability/shared/ChartLegend";
import { ChartTooltipCard } from "@app/components/agent_builder/observability/shared/ChartTooltip";
import { useAgentErrorRate } from "@app/lib/swr/assistants";

const WARNING_THRESHOLD = 5;
const CRITICAL_THRESHOLD = 10;

interface ErrorRateData {
  total: number;
  failed: number;
  errorRate: number;
}

function isErrorRateData(data: unknown): data is ErrorRateData {
  return typeof data === "object" && data !== null && "errorRate" in data;
}

function ErrorRateTooltip({
  active,
  payload,
  label,
}: TooltipContentProps<number, string>): JSX.Element | null {
  if (!active || !payload || payload.length === 0) {
    return null;
  }
  const first = payload[0];
  const row = first.payload;
  if (!row || !isErrorRateData(row)) {
    return null;
  }
  const title = typeof label === "number" ? String(label) : label;
  return (
    <ChartTooltipCard
      title={title}
      rows={[
        {
          label: "Error rate",
          value: `${row.errorRate}%`,
          colorClassName: ERROR_RATE_PALETTE.errorRate,
        },
        {
          label: "Failed",
          value: String(row.failed),
        },
        {
          label: "Total messages",
          value: String(row.total),
        },
      ]}
    />
  );
}

interface ErrorRateChartProps {
  workspaceId: string;
  agentConfigurationId: string;
}

export function ErrorRateChart({
  workspaceId,
  agentConfigurationId,
}: ErrorRateChartProps) {
  const { period } = useObservability();
  const {
    errorRate: data,
    isErrorRateLoading,
    isErrorRateError,
  } = useAgentErrorRate({
    workspaceId,
    agentConfigurationId,
    days: period,
    disabled: !workspaceId || !agentConfigurationId,
  });

  const legendItems = ERROR_RATE_LEGEND.map(({ key, label }) => ({
    key,
    label,
    colorClassName: ERROR_RATE_PALETTE[key],
  }));

  const latestErrorRate = data[data.length - 1]?.errorRate ?? 0;

  const getStatusChip = () => {
    if (latestErrorRate < WARNING_THRESHOLD) {
      return <Chip color="success" size="xs" label="HEALTHY" />;
    } else if (latestErrorRate < CRITICAL_THRESHOLD) {
      return <Chip color="info" size="xs" label="WARNING" />;
    } else {
      return <Chip color="warning" size="xs" label="CRITICAL" />;
    }
  };

  return (
    <ChartContainer
      title="Error rate"
      statusChip={
        !isErrorRateLoading && !isErrorRateError && data.length > 0
          ? getStatusChip()
          : undefined
      }
      isLoading={isErrorRateLoading}
      errorMessage={
        isErrorRateError ? "Failed to load observability data." : undefined
      }
    >
      <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
        <AreaChart
          data={data}
          margin={{ top: 10, right: 30, left: 10, bottom: 20 }}
        >
          <defs>
            <linearGradient id="fillErrorRate" x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="5%"
                stopColor="hsl(var(--chart-4))"
                stopOpacity={0.8}
              />
              <stop
                offset="95%"
                stopColor="hsl(var(--chart-4))"
                stopOpacity={0.1}
              />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} className="stroke-border" />
          <XAxis
            dataKey="date"
            type="category"
            scale="point"
            allowDuplicatedCategory={false}
            className="text-xs text-muted-foreground"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            minTickGap={16}
          />
          <YAxis
            className="text-xs text-muted-foreground"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            type="number"
            allowDecimals={true}
            domain={[0, 100]}
            label={{
              value: "Error rate (%)",
              angle: -90,
              position: "insideLeft",
              style: { textAnchor: "middle" },
            }}
          />
          <Tooltip
            content={ErrorRateTooltip}
            cursor={false}
            wrapperStyle={{ outline: "none" }}
            contentStyle={{
              background: "transparent",
              border: "none",
              padding: 0,
              boxShadow: "none",
            }}
          />
          <ReferenceLine
            y={5}
            stroke="hsl(var(--warning))"
            strokeDasharray="3 3"
            strokeWidth={1.5}
          />
          <ReferenceLine
            y={10}
            stroke="hsl(var(--destructive))"
            strokeDasharray="3 3"
            strokeWidth={1.5}
          />
          <Area
            type="natural"
            dataKey="errorRate"
            name="Error rate"
            fill="url(#fillErrorRate)"
            stroke="hsl(var(--chart-4))"
          />
        </AreaChart>
      </ResponsiveContainer>
      <ChartLegend items={legendItems} />
    </ChartContainer>
  );
}
