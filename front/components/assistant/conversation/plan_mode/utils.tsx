const TITLE_REGEX = /^#\s+(.+)$/m;

export function extractPlanTitle(content: string | null): string {
  if (!content) {
    return "Untitled plan";
  }
  const match = content.match(TITLE_REGEX);
  return match ? match[1].trim() : "Untitled plan";
}

// Short, content-sensitive key (djb2) so the Markdown remounts on any edit without using the full
// content string as a React key.
export function contentHash(content: string): string {
  let hash = 5381;
  for (let i = 0; i < content.length; i++) {
    hash = (hash * 33) ^ content.charCodeAt(i);
  }
  return (hash >>> 0).toString(36);
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
