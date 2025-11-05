import { ReferenceLine } from "recharts";

import type { ObservabilityMode } from "@app/components/agent_builder/observability/ObservabilityContext";

type Marker = { timestamp: string };

function MarkerDotLabel(props: any) {
  const vb = props?.viewBox as
    | { x: number; y: number; width: number; height: number }
    | undefined;
  if (!vb) {
    return null;
  }
  const cx = vb.x;
  const cy = vb.y + vb.height;
  return (
    <g>
      <circle
        cx={cx}
        cy={cy}
        r={3}
        className="text-gray-300 dark:text-gray-300-night"
        fill="currentColor"
      />
    </g>
  );
}

export function VersionMarkersDots({
  mode,
  versionMarkers,
}: {
  mode: ObservabilityMode;
  versionMarkers: Marker[];
}) {
  if (mode !== "timeRange" || versionMarkers.length === 0) {
    return null;
  }
  return (
    <>
      {versionMarkers.map((m) => (
        <ReferenceLine
          key={m.timestamp}
          x={m.timestamp}
          className="text-gray-300 dark:text-gray-300-night"
          stroke="currentColor"
          strokeDasharray="5 5"
          strokeWidth={1}
          ifOverflow="extendDomain"
          label={<MarkerDotLabel />}
        />
      ))}
    </>
  );
}
