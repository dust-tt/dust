import { Spinner } from "@dust-tt/sparkle";
import type { ReactNode } from "react";

import { CHART_HEIGHT } from "@app/components/agent_builder/observability/constants";

interface ChartContainerProps {
  title: string;
  isLoading: boolean;
  errorMessage?: string;
  emptyMessage?: string;
  children: ReactNode;
  additionalControls?: ReactNode;
}

export function ChartContainer({
  title,
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
        <div className="flex items-center gap-3">{additionalControls}</div>
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
