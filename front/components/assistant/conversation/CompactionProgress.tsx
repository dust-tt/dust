import { classNames } from "@app/lib/utils";
import type { CompactionMessageType } from "@app/types/assistant/conversation";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import { Button, ProgressBar } from "@dust-tt/sparkle";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";

// The estimate reaches 85% at the typical 90-second duration and 97% at the
// rare 270-second duration. It approaches 99%. Only completion reaches 100%.
const TYPICAL_SECONDS = 90;
const RARE_SECONDS = 270;
const AT_TYPICAL_PERCENT = 85;
const AT_RARE_PERCENT = 97;
const CEILING_PERCENT = 99;

// Start the long-run reassurance after 150 seconds.
const SLOW_THRESHOLD_SECONDS = 150;

// Update once per second so the displayed whole percentage stays current.
const UPDATE_INTERVAL_MS = 1000;

// Solve the curve's power and time scale from the two anchors above. The curve
// uses u = (elapsed / scale)^power and fill = ceiling * u / (1 + u).
const TYPICAL_RATIO =
  AT_TYPICAL_PERCENT / (CEILING_PERCENT - AT_TYPICAL_PERCENT);
const RARE_RATIO = AT_RARE_PERCENT / (CEILING_PERCENT - AT_RARE_PERCENT);
const CURVE_POWER =
  Math.log(RARE_RATIO / TYPICAL_RATIO) /
  Math.log(RARE_SECONDS / TYPICAL_SECONDS);
const CURVE_SCALE_SECONDS =
  TYPICAL_SECONDS / Math.pow(TYPICAL_RATIO, 1 / CURVE_POWER);

export type CompactionProgressTier =
  | "normal"
  | "past-typical"
  | "slow"
  | "tail";

const STAGE_BY_TIER = {
  normal: "Writing the summary",
  "past-typical": "The conversation is longer than most. Still compacting.",
  slow: "Compaction is taking longer than usual. Your messages are safe.",
  tail: "Compaction is taking much longer than usual. The conversation stays intact even if compaction fails.",
} satisfies Record<CompactionProgressTier, string>;

export function getCompactionFill(elapsedSeconds: number): number {
  const curvePosition = Math.pow(
    elapsedSeconds / CURVE_SCALE_SECONDS,
    CURVE_POWER
  );
  return (CEILING_PERCENT * curvePosition) / (1 + curvePosition);
}

export function getCompactionProgressTier(
  elapsedSeconds: number,
  slowThresholdSeconds = SLOW_THRESHOLD_SECONDS
): CompactionProgressTier {
  if (elapsedSeconds < TYPICAL_SECONDS) {
    return "normal";
  }
  if (elapsedSeconds < slowThresholdSeconds) {
    return "past-typical";
  }
  if (elapsedSeconds < RARE_SECONDS) {
    return "slow";
  }
  return "tail";
}

function useElapsedSeconds(startedAtMs: number, isRunning: boolean): number {
  const [elapsedSeconds, setElapsedSeconds] = useState(() =>
    Math.max(0, Math.floor((Date.now() - startedAtMs) / 1000))
  );

  useEffect(() => {
    const updateElapsedSeconds = () => {
      setElapsedSeconds(
        Math.max(0, Math.floor((Date.now() - startedAtMs) / 1000))
      );
    };

    updateElapsedSeconds();
    if (!isRunning) {
      return;
    }

    const intervalId = window.setInterval(
      updateElapsedSeconds,
      UPDATE_INTERVAL_MS
    );
    return () => window.clearInterval(intervalId);
  }, [isRunning, startedAtMs]);

  return elapsedSeconds;
}

interface CompactionProgressProps {
  message: Pick<CompactionMessageType, "created" | "status">;
  canRetry: boolean;
  isRetrying: boolean;
  onRetry: () => void;
}

type CompactionProgressTone = "default" | "success" | "warning";

const PROGRESS_CLASSES = {
  default: "bg-muted-background [&>div]:bg-foreground",
  success: "bg-success-100 [&>div]:bg-success-700",
  warning: "bg-warning-100 [&>div]:bg-warning-700",
} satisfies Record<CompactionProgressTone, string>;

const STAGE_CLASSES = {
  default: "text-muted-foreground",
  success: "text-success-700",
  warning: "text-warning-700",
} satisfies Record<CompactionProgressTone, string>;

function CompactionProgressCard({
  fillPercentage,
  displayPercentage,
  stage,
  stageAction,
  footer,
  tone,
}: {
  fillPercentage: number;
  displayPercentage?: number;
  stage: string;
  stageAction?: ReactNode;
  footer?: string;
  tone: CompactionProgressTone;
}) {
  return (
    <section className="mb-2 rounded-2xl border border-border bg-background px-4 py-3 md:px-5 md:py-4">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h2 className="text-base font-semibold text-foreground">Compacting</h2>
        {displayPercentage !== undefined && (
          <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
            {displayPercentage}%
          </span>
        )}
      </div>
      <ProgressBar
        label="Conversation compaction progress"
        percentage={fillPercentage}
        className={classNames(
          "h-1 w-full [&>div]:transition-[width] [&>div]:duration-1000 [&>div]:ease-linear motion-reduce:[&>div]:transition-none",
          PROGRESS_CLASSES[tone]
        )}
      />
      <div
        className={classNames(
          "mt-2 flex items-start gap-2 text-sm",
          STAGE_CLASSES[tone]
        )}
        aria-live="polite"
      >
        <span
          aria-hidden
          className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-current opacity-40"
        />
        <span className="grow">{stage}</span>
        {stageAction}
      </div>
      {footer && (
        <p className="mt-2 text-right text-xs text-muted-foreground">
          {footer}
        </p>
      )}
    </section>
  );
}

export function CompactionProgress({
  message,
  canRetry,
  isRetrying,
  onRetry,
}: CompactionProgressProps) {
  const isRunning = message.status === "created";
  const elapsedSeconds = useElapsedSeconds(message.created, isRunning);
  const fillPercentage = getCompactionFill(elapsedSeconds);
  const displayPercentage = Math.floor(fillPercentage);
  const tier = getCompactionProgressTier(elapsedSeconds);
  const isSlow = tier === "slow" || tier === "tail";

  switch (message.status) {
    case "created":
      return (
        <CompactionProgressCard
          fillPercentage={fillPercentage}
          displayPercentage={displayPercentage}
          stage={STAGE_BY_TIER[tier]}
          footer={isSlow ? "Compaction continues if you leave." : undefined}
          tone={isSlow ? "warning" : "default"}
        />
      );
    case "succeeded":
      return (
        <CompactionProgressCard
          fillPercentage={100}
          displayPercentage={100}
          stage="The conversation is compacted. You can keep going."
          tone="success"
        />
      );
    case "failed":
      return (
        <CompactionProgressCard
          fillPercentage={fillPercentage}
          stage="Compaction didn't finish. The conversation is unchanged."
          stageAction={
            <Button
              label="Try again"
              variant="ghost"
              size="xs"
              className="-mr-2 shrink-0"
              disabled={!canRetry || isRetrying}
              isLoading={isRetrying}
              onClick={onRetry}
            />
          }
          tone="warning"
        />
      );
    default:
      assertNeverAndIgnore(message.status);
      return null;
  }
}
