const TITLE_REGEX = /^#\s+(.+)$/m;

export function extractPlanTitle(content: string | null): string {
  if (!content) {
    return "Untitled plan";
  }
  const match = content.match(TITLE_REGEX);
  return match ? match[1].trim() : "Untitled plan";
}

// Task markers: numbered `1. [ ]` items (current template) or bulleted `- [ ]` ones (older plans).
// Total counts every marker (open, done, blocked); done counts only checked boxes. `[!]` is
// "blocked" by convention and is intentionally excluded from the "done" set so the progress chip
// surfaces unfinished work.
const TASK_TOTAL_REGEX = /^\s*(?:-|\d+\.)\s*\[[ xX!]\]/gm;
const TASK_DONE_REGEX = /^\s*(?:-|\d+\.)\s*\[[xX]\]/gm;

export function countProgress(content: string | null): {
  done: number;
  total: number;
} {
  if (!content) {
    return { done: 0, total: 0 };
  }
  const total = (content.match(TASK_TOTAL_REGEX) ?? []).length;
  const done = (content.match(TASK_DONE_REGEX) ?? []).length;
  return { done, total };
}

export type PlanPresence = "unknown" | "empty" | "present";

// Drives the plan panel from the plan's presence, so open/close work however the change arrived
// (live action event, cross-client `plan_updated`, reconnect refetch) rather than depending on any
// single (possibly dropped) signal. The caller carries `prev` across renders.
//
// - Open on empty -> present (a freshly created plan). "unknown" is the pre-settle state, so a plan
//   already present on load does not auto-open. Never auto-opens on mobile.
// - Close on present -> empty (the plan was closed), but only when the plan panel is the open one.
export function planPanelDecision({
  isLoading,
  hasContent,
  isMobile,
  isPanelOpen,
  prev,
}: {
  isLoading: boolean;
  hasContent: boolean;
  isMobile: boolean;
  isPanelOpen: boolean;
  prev: PlanPresence;
}): { next: PlanPresence; action: "open" | "close" | null } {
  if (isLoading) {
    return { next: prev, action: null };
  }
  if (hasContent) {
    return {
      next: "present",
      action: prev === "empty" && !isMobile ? "open" : null,
    };
  }
  return {
    next: "empty",
    action: prev === "present" && isPanelOpen ? "close" : null,
  };
}
