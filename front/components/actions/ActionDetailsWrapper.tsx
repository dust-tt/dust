import type { ActionDetailsDisplayContext } from "@app/components/actions/mcp/details/types";
import { cn, Icon, Spinner } from "@dust-tt/sparkle";
import type { ComponentType } from "react";
import { createContext, useContext, useMemo } from "react";

interface ActionExecutionContextValue {
  executionDurationMs: number | null;
}

const ActionExecutionContext = createContext<ActionExecutionContextValue>({
  executionDurationMs: null,
});

interface ActionExecutionProviderProps {
  executionDurationMs: number | null;
  children: React.ReactNode;
}

export function ActionExecutionProvider({
  executionDurationMs,
  children,
}: ActionExecutionProviderProps) {
  const value = useMemo(() => ({ executionDurationMs }), [executionDurationMs]);
  return (
    <ActionExecutionContext.Provider value={value}>
      {children}
    </ActionExecutionContext.Provider>
  );
}

interface ActionDetailsWrapperProps {
  actionName: string;
  children?: React.ReactNode;
  displayContext: ActionDetailsDisplayContext;
  executionDurationMs?: number | null;
  headerAction?: React.ReactNode;
  visual: ComponentType<{ className?: string }>;
}

function formatDurationMs(durationMs: number): string {
  if (durationMs < 1000) {
    return `${Math.round(durationMs)}ms`;
  }
  const seconds = durationMs / 1000;
  if (seconds < 60) {
    return `${seconds.toFixed(1)}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.round(seconds - minutes * 60);
  return `${minutes}m ${remainder}s`;
}

interface DurationLabelProps {
  durationMs: number;
  size: "xs" | "sm";
}

function DurationLabel({ durationMs, size }: DurationLabelProps) {
  return (
    <span
      className={cn(
        "text-muted-foreground dark:text-muted-foreground-night",
        size === "xs" ? "text-xs" : "text-sm"
      )}
    >
      {formatDurationMs(durationMs)}
    </span>
  );
}

export function ActionDetailsWrapper({
  actionName,
  children,
  displayContext,
  executionDurationMs: executionDurationMsProp,
  headerAction,
  visual,
}: ActionDetailsWrapperProps) {
  const { executionDurationMs: executionDurationMsContext } = useContext(
    ActionExecutionContext
  );
  const executionDurationMs =
    executionDurationMsProp !== undefined
      ? executionDurationMsProp
      : executionDurationMsContext;
  const hasDuration = executionDurationMs !== null;

  if (displayContext === "conversation") {
    return (
      <div className="flex w-full flex-col gap-y-2">
        <div
          className={cn(
            "text-foreground dark:text-foreground-night",
            "flex flex-grow flex-row items-center gap-x-2"
          )}
        >
          <Icon visual={visual} size="xs" />
          <span className="heading-sm font-medium">{actionName}</span>
          {hasDuration && (
            <DurationLabel durationMs={executionDurationMs} size="xs" />
          )}
          <span className="flex-grow"></span>
          {headerAction}
          {/* TODO: Align spinner with CoT spinner: <div className="self-start"> */}
          <div>
            <Spinner size="xs" />
          </div>
        </div>
        {children}
      </div>
    );
  }

  return (
    <div>
      <div
        className={cn(
          "text-foreground dark:text-foreground-night",
          "flex flex-row items-center gap-x-2"
        )}
      >
        <Icon visual={visual} />
        <span className="heading-base">{actionName}</span>
        {hasDuration && (
          <DurationLabel durationMs={executionDurationMs} size="sm" />
        )}
        <span className="flex-grow"></span>
        {headerAction}
      </div>
      {children}
    </div>
  );
}
