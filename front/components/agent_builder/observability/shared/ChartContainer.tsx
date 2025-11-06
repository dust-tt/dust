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
    <div>
      <div className="flex items-center justify-between">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-base font-medium text-foreground dark:text-foreground-night">
            {title}
          </h3>
          {statusChip}
        </div>
        <div className="flex items-center gap-3">{additionalControls}</div>
      </div>
      {description && (
        <div className="my-3 text-xs text-muted-foreground">{description}</div>
      )}
      {isLoading || message ? (
        <div
          className="flex items-center justify-center"
          style={{ height: CHART_HEIGHT }}
        >
          {isLoading ? (
            <Spinner size="lg" />
          ) : (
            <span className="text-sm text-muted-foreground dark:text-foreground-night">
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
