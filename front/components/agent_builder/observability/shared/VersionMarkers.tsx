import { ReferenceLine } from "recharts";

import type { ObservabilityMode } from "@app/components/agent_builder/observability/ObservabilityContext";
import { formatShortDate } from "@app/lib/utils/timestamps";

type Marker = { timestamp: number };

interface MarkerDotLabelProps {
  viewBox?: { x: number; y: number; width: number; height: number };
}

function MarkerDotLabel({ viewBox }: MarkerDotLabelProps) {
  const vb = viewBox;
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

interface VersionMarkersDotsProps {
  mode: ObservabilityMode;
  versionMarkers: Marker[];
}

export function VersionMarkersDots({
  mode,
  versionMarkers,
}: VersionMarkersDotsProps) {
  if (mode !== "timeRange" || versionMarkers.length === 0) {
    return null;
  }

  return versionMarkers.map((m) => {
    const formattedDate = formatShortDate(m.timestamp);

    return (
      <ReferenceLine
        key={m.timestamp}
        x={formattedDate}
        className="text-gray-300 dark:text-gray-300-night"
        stroke="currentColor"
        strokeDasharray="5 5"
        strokeWidth={1}
        ifOverflow="extendDomain"
        label={<MarkerDotLabel />}
      />
    );
  });
}
