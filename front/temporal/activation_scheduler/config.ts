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
export const DEFAULT_ACTIVATION_NUDGE_MAX_UNANSWERED_COUNT = 2;

// Max users a single activation workspace workflow may nudge. Applied when
// enumerating the run; poke can skip it via overrideChecks.
export const DEFAULT_ACTIVATION_NUDGE_MAX_USERS_PER_RUN = 100;

export type ActivationNudgePerRunCapItem = {
  lastNudgedAtMs: number | null;
};

function compareByLongestWithoutNudge(
  a: ActivationNudgePerRunCapItem,
  b: ActivationNudgePerRunCapItem
): number {
  if (a.lastNudgedAtMs === b.lastNudgedAtMs) {
    return 0;
  }
  if (a.lastNudgedAtMs === null) {
    return -1;
  }
  if (b.lastNudgedAtMs === null) {
    return 1;
  }
  return a.lastNudgedAtMs - b.lastNudgedAtMs;
}

// Keeps the pods that have gone the longest without a nudge (never-nudged
// first, then oldest last-nudge). Poke can skip the cap via overrideChecks.
export function applyActivationNudgePerRunCap<
  T extends ActivationNudgePerRunCapItem,
>(items: T[], { overrideChecks }: { overrideChecks: boolean }): T[] {
  if (overrideChecks) {
    return [...items];
  }
  return [...items]
    .sort(compareByLongestWithoutNudge)
    .slice(0, DEFAULT_ACTIVATION_NUDGE_MAX_USERS_PER_RUN);
}
