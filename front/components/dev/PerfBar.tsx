import type { PerfMetrics } from "./useDevPerf";

interface MetricItemProps {
  label: string;
  value: string;
  valueWidthPx: number;
  color?: string;
  tooltip?: string;
  compact?: boolean;
}

function MetricItem({
  label,
  value,
  valueWidthPx,
  color,
  tooltip,
  compact,
}: MetricItemProps) {
  return (
    <span
      title={tooltip}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        fontSize: 11,
        whiteSpace: "nowrap",
        cursor: tooltip ? "help" : undefined,
      }}
    >
      {!compact && <span style={{ color: "inherit" }}>{label}</span>}
      <span
        style={{
          color: color ?? "inherit",
          fontWeight: 600,
          width: valueWidthPx,
          textAlign: "right",
        }}
      >
        {value}
      </span>
    </span>
  );
}

interface PerfBarProps {
  metrics: PerfMetrics;
  compact?: boolean;
}

export function PerfBar({ metrics, compact }: PerfBarProps) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
      }}
    >
      {metrics.memoryMb !== null && (
        <MetricItem
          label="Mem"
          value={`${(metrics.memoryMb / 1024).toFixed(2)}GB`}
          valueWidthPx={48}
          compact={compact}
          tooltip={[
            "JS Heap Memory (Chrome only)",
            `Used: ${metrics.memoryMb}MB`,
            "",
            "Good: <200MB",
            "Warning: 200-500MB",
            "Bad: >500MB",
            "",
            "High values may indicate memory leaks",
            "or large cached datasets.",
          ].join("\n")}
        />
      )}
      <MetricItem
        label="FPS"
        value={String(metrics.fps)}
        valueWidthPx={22}
        compact={compact}
        color={
          metrics.fps < 30
            ? "#ff6b6b"
            : metrics.fps < 50
              ? "#ffaa0d"
              : "#00897B"
        }
        tooltip={[
          "Frames Per Second",
          "Measured via requestAnimationFrame.",
          "",
          "Good: 60 (smooth)",
          "OK: 30-59 (noticeable lag)",
          "Bad: <30 (janky, stuttering UI)",
          "",
          "Drops during heavy renders,",
          "animations, or main thread work.",
        ].join("\n")}
      />
      <MetricItem
        label="Jank"
        value={`${metrics.jankPct}%`}
        valueWidthPx={30}
        compact={compact}
        color={
          metrics.jankPct > 12
            ? "#ff6b6b"
            : metrics.jankPct > 4
              ? "#ffaa0d"
              : "inherit"
        }
        tooltip={[
          "Jank — UI sluggishness caused by long",
          "tasks (>50ms) blocking the main thread.",
          "Shows % of time blocked over the last 5s.",
          "",
          "Thresholds (derived from Web Vitals TBT):",
          "Good: <4% (<200ms blocked per 5s)",
          "Warning: 4-12% (200-600ms per 5s)",
          "Poor: >12% (>600ms per 5s)",
        ].join("\n")}
      />
      <MetricItem
        label="Net"
        value={String(metrics.netRequests)}
        valueWidthPx={22}
        compact={compact}
        tooltip={[
          "Network requests in the last 1 second.",
          "Counts both fetch() and XMLHttpRequest calls.",
        ].join("\n")}
      />
    </div>
  );
}
