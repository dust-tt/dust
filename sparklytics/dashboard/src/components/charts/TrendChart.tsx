"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import type { TrendPoint } from "@/lib/types";

interface TrendChartProps {
  data: TrendPoint[];
  metrics?: Array<"healthScore" | "adoptionRate" | "colorComplianceRate">;
}

// VoltAgent multi-color palette — distinct per metric
const METRIC_CONFIG = {
  healthScore:         { label: "Health Score",     color: "#00d992" }, // Signal Green
  adoptionRate:        { label: "Adoption Rate",    color: "#ffba00" }, // Warning Amber
  colorComplianceRate: { label: "Color Compliance", color: "#818cf8" }, // Soft Purple
} as const;

export function TrendChart({
  data,
  metrics = ["healthScore", "adoptionRate"],
}: TrendChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-gray-500 text-sm">
        No trend data yet. Run more scans to see trends.
      </div>
    );
  }

  const chartData = data.map((p) => ({
    ...p,
    adoptionRatePct: Math.round(p.adoptionRate * 100 * 10) / 10,
    colorComplianceRatePct: Math.round(p.colorComplianceRate * 100 * 10) / 10,
  }));

  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
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
          labelStyle={{ color: "#8b949e", fontSize: 11 }}
          itemStyle={{ color: "#f2f2f2", fontSize: 12 }}
        />
        <Legend wrapperStyle={{ fontSize: 12, color: "#8b949e" }} />
        {metrics.includes("healthScore") && (
          <Line
            type="monotone"
            dataKey="healthScore"
            name="Health Score"
            stroke={METRIC_CONFIG.healthScore.color}
            strokeWidth={1.5}
            dot={false}
            activeDot={{ r: 3, fill: METRIC_CONFIG.healthScore.color }}
          />
        )}
        {metrics.includes("adoptionRate") && (
          <Line
            type="monotone"
            dataKey="adoptionRatePct"
            name="Adoption %"
            stroke={METRIC_CONFIG.adoptionRate.color}
            strokeWidth={1.5}
            dot={false}
            activeDot={{ r: 3, fill: METRIC_CONFIG.adoptionRate.color }}
          />
        )}
        {metrics.includes("colorComplianceRate") && (
          <Line
            type="monotone"
            dataKey="colorComplianceRatePct"
            name="Color Compliance %"
            stroke={METRIC_CONFIG.colorComplianceRate.color}
            strokeWidth={1.5}
            dot={false}
            activeDot={{ r: 3, fill: METRIC_CONFIG.colorComplianceRate.color }}
          />
        )}
      </LineChart>
    </ResponsiveContainer>
  );
}
