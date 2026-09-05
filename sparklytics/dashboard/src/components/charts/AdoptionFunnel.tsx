"use client";

import {
  FunnelChart,
  Funnel,
  Tooltip,
  LabelList,
  ResponsiveContainer,
} from "recharts";

interface FunnelData {
  label: string;
  value: number;
  fill: string;
}

interface AdoptionFunnelProps {
  totalAvailable: number;
  totalDiscovered: number;
  totalUsed: number;
  totalRetained: number;
}

export function AdoptionFunnel({
  totalAvailable,
  totalDiscovered,
  totalUsed,
  totalRetained,
}: AdoptionFunnelProps) {
  const data: FunnelData[] = [
    { label: "Available",   value: totalAvailable,  fill: "#3d3a39" }, // Warm Charcoal — base
    { label: "Discovered",  value: totalDiscovered, fill: "#818cf8" }, // Soft Purple — secondary
    { label: "Used (≥1)",   value: totalUsed,       fill: "#ffba00" }, // Amber — active attention
    { label: "Retained",    value: totalRetained,   fill: "#00d992" }, // Signal Green — success
  ];

  return (
    <ResponsiveContainer width="100%" height={260}>
      <FunnelChart>
        <Tooltip
          contentStyle={{
            background: "#101010",
            border: "1px solid #3d3a39",
            borderRadius: 6,
            boxShadow: "rgba(92, 88, 85, 0.2) 0px 0px 15px",
          }}
          itemStyle={{ color: "#f2f2f2", fontSize: 12 }}
        />
        <Funnel dataKey="value" data={data} isAnimationActive>
          <LabelList
            position="right"
            fill="#b8b3b0"
            stroke="none"
            dataKey="label"
            style={{ fontSize: 12 }}
          />
        </Funnel>
      </FunnelChart>
    </ResponsiveContainer>
  );
}
