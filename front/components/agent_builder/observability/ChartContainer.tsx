import { cn, Spinner } from "@dust-tt/sparkle";
import type { ReactNode } from "react";

import type { ObservabilityTimeRangeType } from "@app/components/agent_builder/observability/constants";
import {
  CHART_HEIGHT,
  OBSERVABILITY_TIME_RANGE,
} from "@app/components/agent_builder/observability/constants";

interface ChartContainerProps {
  title: string;
  period: ObservabilityTimeRangeType;
  onPeriodChange: (period: ObservabilityTimeRangeType) => void;
  isLoading: boolean;
  errorMessage?: string;
  emptyMessage?: string;
  children: ReactNode;
  additionalControls?: ReactNode;
}

export function ChartContainer({
  title,
  period,
  onPeriodChange,
  isLoading,
  errorMessage,
  emptyMessage,
  children,
  additionalControls,
}: ChartContainerProps) {
  const message = isLoading ? null : errorMessage ?? emptyMessage;


  return (
    <div className="bg-card rounded-lg border border-border p-4">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-medium text-foreground">{title}</h3>
        <div className="flex items-center gap-3">
          {OBSERVABILITY_TIME_RANGE.map((p) => (
            <button
              key={p}
              onClick={() => onPeriodChange(p)}
              className={cn(
                "rounded px-2 py-1 text-xs",
                period === p
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {p}d
            </button>
          ))}
          {additionalControls}
        </div>
      </div>
      {isLoading || message ? (
        <div
          className="flex items-center justify-center"
          style={{ height: CHART_HEIGHT }}
        >
          {isLoading ? (
            <Spinner size="lg" />
          ) : (
            <span className="text-sm text-muted-foreground">{message}</span>
          )}
        </div>
      ) : (
        children
      )}
    </div>
  );
}
