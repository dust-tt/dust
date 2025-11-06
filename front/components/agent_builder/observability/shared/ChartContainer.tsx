import { cn, Spinner } from "@dust-tt/sparkle";
import type { ReactNode } from "react";

import {
  CHART_CONTAINER_HEIGHT_CLASS,
  CHART_HEIGHT,
} from "@app/components/agent_builder/observability/constants";

interface ChartContainerProps {
  title: string;
  isLoading: boolean;
  errorMessage?: string;
  emptyMessage?: string;
  children: ReactNode;
  additionalControls?: ReactNode;
  statusChip?: ReactNode;
  description?: string;
}

export function ChartContainer({
  title,
  isLoading,
  errorMessage,
  emptyMessage,
  children,
  additionalControls,
  statusChip,
  description,
}: ChartContainerProps) {
  const message = isLoading ? null : errorMessage ?? emptyMessage;

  return (
    <div
      className={cn(
        "bg-card rounded-lg border border-border p-4 dark:border-border-night",
        CHART_CONTAINER_HEIGHT_CLASS
      )}
    >
      <div
        className={cn(
          "flex items-center justify-between",
          description ? "mb-2" : "mb-4"
        )}
      >
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-medium text-foreground dark:text-foreground-night">
            {title}
          </h3>
          {statusChip}
        </div>
        <div className="flex items-center gap-3">{additionalControls}</div>
      </div>
      {description && (
        <div className="mb-3 text-xs text-muted-foreground dark:text-muted-foreground-night">
          {description}
        </div>
      )}
      {isLoading || message ? (
        <div
          className="flex items-center justify-center"
          style={{ height: CHART_HEIGHT }}
        >
          {isLoading ? (
            <Spinner size="lg" />
          ) : (
            <span className="text-sm text-muted-foreground dark:text-muted-foreground-night">
              {message}
            </span>
          )}
        </div>
      ) : (
        children
      )}
    </div>
  );
}
