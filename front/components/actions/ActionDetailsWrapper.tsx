import type { ActionDetailsDisplayContext } from "@app/components/actions/mcp/details/types";
import { cn, Icon, Spinner } from "@dust-tt/sparkle";
import type { ComponentType } from "react";
import { createContext, useContext, useEffect, useMemo, useState } from "react";

interface ActionExecutionContextValue {
  executionDurationMs: number | null;
  isExecuting: boolean;
  startedAtMs: number | null;
}

const ActionExecutionContext = createContext<ActionExecutionContextValue>({
  executionDurationMs: null,
  isExecuting: false,
  startedAtMs: null,
});

interface ActionExecutionProviderProps {
  executionDurationMs: number | null;
  isExecuting: boolean;
  startedAtMs: number | null;
  children: React.ReactNode;
}

export function ActionExecutionProvider({
  executionDurationMs,
  isExecuting,
  startedAtMs,
  children,
}: ActionExecutionProviderProps) {
  const value = useMemo(
    () => ({ executionDurationMs, isExecuting, startedAtMs }),
    [executionDurationMs, isExecuting, startedAtMs]
  );
  return (
    <ActionExecutionContext.Provider value={value}>
      {children}
    </ActionExecutionContext.Provider>
  );
}

function useLiveElapsedMs(startedAtMs: number | null, enabled: boolean) {
  // Snapshot the wall-clock moment we observe `enabled` going true so that any
  // time the action spent in ready/blocked states (auth, validation, user
  // input...) doesn't get counted toward the live elapsed display. If the
  // panel mounts already in the executing state, we have no transition to
  // observe — fall back to the action's startedAtMs so the first reading
  // isn't stuck at zero.
  const [executionStartMs, setExecutionStartMs] = useState<number | null>(() =>
    enabled ? (startedAtMs ?? Date.now()) : null
  );
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) {
      setExecutionStartMs(null);
      return;
    }
    setExecutionStartMs((prev) => prev ?? Date.now());
    // Refresh now once on the rising edge so the first render after enabling
    // doesn't show an elapsed computed from a stale mount-time `nowMs`.
    setNowMs(Date.now());
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [enabled]);
  if (executionStartMs === null) {
    return null;
  }
  return Math.max(0, nowMs - executionStartMs);
}

interface ActionDetailsWrapperProps {
  actionName: string;
  children?: React.ReactNode;
  displayContext: ActionDetailsDisplayContext;
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
  if (durationMs < 60_000) {
    return wholeSeconds
      ? `${Math.floor(durationMs / 1000)}s`
      : `${(durationMs / 1000).toFixed(1)}s`;
  }
  // Round to whole seconds first, then split, so we never produce 60s as a
  // remainder (e.g. 119.6s → "2m 0s", not "1m 60s").
  const totalSeconds = Math.round(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const remainderSeconds = totalSeconds - minutes * 60;
  return `${minutes}m ${remainderSeconds}s`;
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
  headerAction,
  visual,
}: ActionDetailsWrapperProps) {
  const { executionDurationMs, isExecuting, startedAtMs } = useContext(
    ActionExecutionContext
  );
  // Only tick when the tool is actually executing — not while it sits in
  // ready/blocked states (auth, validation, user input...) where elapsed
  // wall time has nothing to do with execution duration.
  const isRunning = isExecuting && executionDurationMs === null;
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
