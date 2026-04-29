import type { ActionDetailsDisplayContext } from "@app/components/actions/mcp/details/types";
import { cn, Icon, Spinner } from "@dust-tt/sparkle";
import type { ComponentType } from "react";
import { createContext, useContext, useEffect, useMemo, useState } from "react";

interface ActionExecutionContextValue {
  executionDurationMs: number | null;
  isFinal: boolean;
  startedAtMs: number | null;
}

const ActionExecutionContext = createContext<ActionExecutionContextValue>({
  executionDurationMs: null,
  isFinal: false,
  startedAtMs: null,
});

interface ActionExecutionProviderProps {
  executionDurationMs: number | null;
  isFinal: boolean;
  startedAtMs: number | null;
  children: React.ReactNode;
}

export function ActionExecutionProvider({
  executionDurationMs,
  isFinal,
  startedAtMs,
  children,
}: ActionExecutionProviderProps) {
  const value = useMemo(
    () => ({ executionDurationMs, isFinal, startedAtMs }),
    [executionDurationMs, isFinal, startedAtMs]
  );
  return (
    <ActionExecutionContext.Provider value={value}>
      {children}
    </ActionExecutionContext.Provider>
  );
}

function useLiveElapsedMs(startedAtMs: number | null, enabled: boolean) {
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled || startedAtMs === null) {
      return;
    }
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [enabled, startedAtMs]);
  if (startedAtMs === null) {
    return null;
  }
  return Math.max(0, nowMs - startedAtMs);
}

interface ActionDetailsWrapperProps {
  actionName: string;
  children?: React.ReactNode;
  displayContext: ActionDetailsDisplayContext;
  executionDurationMs?: number | null;
  headerAction?: React.ReactNode;
  visual: ComponentType<{ className?: string }>;
}

function formatDurationMs(
  durationMs: number,
  { wholeSeconds = false }: { wholeSeconds?: boolean } = {}
): string {
  if (!wholeSeconds && durationMs < 1000) {
    return `${Math.round(durationMs)}ms`;
  }
  const totalSeconds = wholeSeconds
    ? Math.floor(durationMs / 1000)
    : durationMs / 1000;
  if (totalSeconds < 60) {
    return wholeSeconds ? `${totalSeconds}s` : `${totalSeconds.toFixed(1)}s`;
  }
  const minutes = Math.floor(totalSeconds / 60);
  const remainder = Math.round(totalSeconds - minutes * 60);
  return `${minutes}m ${remainder}s`;
}

interface DurationLabelProps {
  durationMs: number;
  isRunning: boolean;
  size: "xs" | "sm";
}

function DurationLabel({ durationMs, isRunning, size }: DurationLabelProps) {
  return (
    <span
      className={cn(
        "text-muted-foreground dark:text-muted-foreground-night",
        size === "xs" ? "text-xs" : "text-sm"
      )}
    >
      {isRunning ? "running for " : "executed in "}
      {formatDurationMs(durationMs, { wholeSeconds: isRunning })}
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
  const {
    executionDurationMs: executionDurationMsContext,
    isFinal,
    startedAtMs,
  } = useContext(ActionExecutionContext);
  const executionDurationMs =
    executionDurationMsProp !== undefined
      ? executionDurationMsProp
      : executionDurationMsContext;
  const isRunning = !isFinal && executionDurationMs === null;
  const liveElapsedMs = useLiveElapsedMs(startedAtMs, isRunning);
  const displayedDurationMs = isRunning ? liveElapsedMs : executionDurationMs;
  const hasDuration = displayedDurationMs !== null;

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
            <DurationLabel
              durationMs={displayedDurationMs}
              isRunning={isRunning}
              size="xs"
            />
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
          <DurationLabel
            durationMs={displayedDurationMs}
            isRunning={isRunning}
            size="sm"
          />
        )}
        <span className="flex-grow"></span>
        {headerAction}
      </div>
      {children}
    </div>
  );
}
