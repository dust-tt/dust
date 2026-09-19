"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";
import type { TrendPoint, ForecastPoint } from "@/lib/types";

interface ForecastChartProps {
  history: TrendPoint[];
  forecast: ForecastPoint[];
  metric: "healthScore" | "adoptionRate";
  goalValue?: number;
}

export function ForecastChart({
  history,
  forecast,
  metric,
  goalValue,
}: ForecastChartProps) {
  const historyData = history.map((p) => ({
    date: p.date,
    actual: metric === "healthScore" ? p.healthScore : Math.round(p.adoptionRate * 100 * 10) / 10,
  }));

  const forecastData = forecast.map((p) => ({
    date: p.date,
    projected: Math.round(p.value * 10) / 10,
  }));

  const combined = [
    ...historyData.map((d) => ({ ...d, projected: undefined as number | undefined })),
    ...forecastData.map((d) => ({ ...d, actual: undefined as number | undefined })),
  ];

  const label = metric === "healthScore" ? "Health Score" : "Adoption %";

  // Actual = Signal Green; projected = Soft Purple (dashed)
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={combined} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(61, 58, 57, 0.6)" />
        <XAxis
          dataKey="date"
          tick={{ fill: "#8b949e", fontSize: 11 }}
          tickLine={false}
          axisLine={{ stroke: "#3d3a39" }}
        />
        <YAxis
          tick={{ fill: "#8b949e", fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          domain={[0, 100]}
        />
        <Tooltip
          contentStyle={{
            background: "#101010",
            border: "1px solid #3d3a39",
            borderRadius: 6,
            boxShadow: "rgba(92, 88, 85, 0.2) 0px 0px 15px",
          }}
          itemStyle={{ color: "#f2f2f2", fontSize: 12 }}
        />
        {goalValue !== undefined && (
          <ReferenceLine
            y={goalValue}
            stroke="#ffba00"
            strokeDasharray="4 2"
            label={{ value: `Goal: ${goalValue}`, fill: "#ffba00", fontSize: 11 }}
          />
        )}
        {/* Actual history — Signal Green */}
        <Line
          type="monotone"
          dataKey="actual"
          name={label}
          stroke="#00d992"
          strokeWidth={1.5}
          dot={false}
          connectNulls={false}
          activeDot={{ r: 3, fill: "#00d992" }}
        />
        {/* Projected — Soft Purple dashed */}
        <Line
          type="monotone"
          dataKey="projected"
          name={`Projected ${label}`}
          stroke="#818cf8"
          strokeWidth={1.5}
          strokeDasharray="4 2"
          dot={false}
          connectNulls={false}
          activeDot={{ r: 3, fill: "#818cf8" }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
