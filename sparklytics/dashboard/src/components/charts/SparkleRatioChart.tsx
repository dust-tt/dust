"use client";

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import type { TrendPoint } from "@/lib/types";

interface SparkleRatioChartProps {
  data: TrendPoint[];
}

interface TooltipPayload {
  name: string;
  value: number | null;
}

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipPayload[];
  label?: string;
}) {
  if (!active) return null;
  const sparkle = payload?.find((p) => p.name === "Sparkle");
  const hasData = sparkle?.value != null;
  return (
    <div
      className="text-xs px-3 py-2 rounded-lg"
      style={{
        background: "#101010",
        border: "1px solid #3d3a39",
        boxShadow: "rgba(92, 88, 85, 0.2) 0px 0px 15px",
      }}
    >
      <p className="text-gray-500 mb-1">{label}</p>
      {hasData ? (
        <>
          <p style={{ color: "#00d992" }}>Sparkle {sparkle!.value!.toFixed(1)}%</p>
          <p className="text-gray-400">Other {(100 - sparkle!.value!).toFixed(1)}%</p>
        </>
      ) : (
        <p className="text-gray-600">No scan</p>
      )}
    </div>
  );
}

function formatDateLabel(iso: string): string {
  const [, m, d] = iso.split("-");
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${months[parseInt(m, 10) - 1]} ${parseInt(d, 10)}`;
}

export function SparkleRatioChart({ data }: SparkleRatioChartProps) {
  // Build a full 30-day scaffold so empty days show as gaps
  const today = new Date();
  const dataByDate = new Map(data.map((p) => [p.date, p]));

  const chartData = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() - (29 - i));
    const date = d.toISOString().split("T")[0];
    const point = dataByDate.get(date);
    return {
      date: formatDateLabel(date),
      sparkle: point != null ? Math.round(point.sparkleRatio * 1000) / 10 : null,
      other: point != null ? Math.round((1 - point.sparkleRatio) * 1000) / 10 : null,
      hasData: point != null,
    };
  });

  const lastScanIdx = chartData.reduce((last, d, i) => (d.hasData ? i : last), -1);
  const latest = lastScanIdx >= 0 ? chartData[lastScanIdx] : null;

  return (
    <div>
      {/* Current ratio callout */}
      <div className="flex items-baseline gap-2 mb-4">
        {latest ? (
          <>
            <span className="text-2xl font-semibold" style={{ color: "#00d992" }}>
              {latest.sparkle!.toFixed(1)}%
            </span>
            <span className="text-xs text-gray-400">
              Sparkle · {latest.other!.toFixed(1)}% other
            </span>
          </>
        ) : (
          <span className="text-sm text-gray-500">No data yet</span>
        )}
      </div>

      <ResponsiveContainer width="100%" height={180}>
        <BarChart
          data={chartData}
          margin={{ top: 0, right: 0, left: -20, bottom: 0 }}
          barCategoryGap="25%"
        >
          <XAxis
            dataKey="date"
            tick={{ fill: "#8b949e", fontSize: 10 }}
            tickLine={false}
            axisLine={false}
            interval={5}
          />
          <YAxis
            domain={[0, 100]}
            tick={{ fill: "#8b949e", fontSize: 10 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => `${v}%`}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(61,58,57,0.2)" }} />

          {/* Other components — Warm Charcoal void */}
          <Bar dataKey="other" name="Other" stackId="ratio" radius={[0, 0, 0, 0]}>
            {chartData.map((d, i) => (
              <Cell
                key={i}
                fill="#3d3a39"
                fillOpacity={d.hasData ? (i === lastScanIdx ? 0.9 : 0.5) : 0}
              />
            ))}
          </Bar>

          {/* Sparkle — Signal Green */}
          <Bar dataKey="sparkle" name="Sparkle" stackId="ratio" radius={[3, 3, 0, 0]}>
            {chartData.map((d, i) => (
              <Cell
                key={i}
                fill="#00d992"
                fillOpacity={d.hasData ? (i === lastScanIdx ? 1 : 0.55) : 0}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      {/* Legend */}
      <div className="flex gap-4 mt-2">
        <div className="flex items-center gap-1.5 text-xs text-gray-400">
          <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: "#00d992" }} />
          Sparkle
        </div>
        <div className="flex items-center gap-1.5 text-xs text-gray-400">
          <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: "#3d3a39" }} />
          Other components
        </div>
      </div>
    </div>
  );
}
