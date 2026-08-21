const QUEUE_VERSION = 1;
export const QUEUE_NAME = `activation-scheduler-queue-v${QUEUE_VERSION}`;

// Pods are nudged at a deterministic slot within this window of the regional
// workday (9:30 - 16:30), spreading nudges out instead of firing them all at
// once when the workspace schedule triggers.
export const ACTIVATION_WORKDAY_WINDOW_START_MINUTES = 9 * 60 + 30;
export const ACTIVATION_WORKDAY_WINDOW_MINUTES = 7 * 60;

// Default number of days to wait before nudging the same pod again. Workspaces
// can override this via the `activationNudgeFrequencyCapDays` metadata key.
export const DEFAULT_ACTIVATION_NUDGE_FREQUENCY_CAP_DAYS = 2;

// Default number of consecutive unanswered nudges (no user message since the
// nudge fired) after which the scheduler stops nudging a pod. Workspaces can
// override this via the `activationNudgeMaxUnansweredCount` metadata key.
export const DEFAULT_ACTIVATION_NUDGE_MAX_UNANSWERED_COUNT = 3;

// Max users a single activation workspace workflow may nudge. Applied when
// enumerating the run; poke can skip it via overrideChecks.
export const DEFAULT_ACTIVATION_NUDGE_MAX_USERS_PER_RUN = 100;

export function applyActivationNudgePerRunCap<T>(
  items: T[],
  { overrideChecks }: { overrideChecks: boolean }
): T[] {
  if (overrideChecks) {
    return items;
  }
  return items.slice(0, DEFAULT_ACTIVATION_NUDGE_MAX_USERS_PER_RUN);
}
