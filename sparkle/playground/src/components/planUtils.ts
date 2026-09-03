/**
 * Mirrors front's `components/assistant/conversation/plan_mode/utils.tsx`
 * plus the task-marker counting from its `PlanCard.tsx`.
 *
 * In production the plan is a markdown file (`plan.md`) the agent writes with
 * `create_plan` and mutates with `edit_plan` (a single exact string
 * replacement). Everything the UI shows is derived from that markdown.
 */

const TITLE_REGEX = /^#\s+(.+)$/m;

export function extractPlanTitle(content: string | null): string {
  if (!content) {
    return "Untitled plan";
  }
  const match = content.match(TITLE_REGEX);
  return match ? match[1].trim() : "Untitled plan";
}

// Short, content-sensitive key (djb2) so the Markdown remounts on any edit
// without using the full content string as a React key.
export function contentHash(content: string): string {
  let hash = 5381;
  for (let i = 0; i < content.length; i++) {
    hash = (hash * 33) ^ content.charCodeAt(i);
  }
  return (hash >>> 0).toString(36);
}

// Total counts every task marker (open, done, blocked); done counts only checked boxes.
// `[!]` is "blocked" by convention and is intentionally excluded from the "done" set so the
// progress chip surfaces unfinished work.
const TASK_TOTAL_REGEX = /^\s*-\s*\[[ xX!]\]/gm;
const TASK_DONE_REGEX = /^\s*-\s*\[[xX]\]/gm;

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

/**
 * The `edit_plan` tool: replace `oldString` with `newString`, which must match
 * exactly once. Returns null when the edit does not apply, like production.
 */
export function editPlan(
  content: string,
  oldString: string,
  newString: string
): string | null {
  const first = content.indexOf(oldString);
  if (first === -1 || content.indexOf(oldString, first + 1) !== -1) {
    return null;
  }
  return (
    content.slice(0, first) +
    newString +
    content.slice(first + oldString.length)
  );
}

export type PlanPresence = "unknown" | "empty" | "present";

/**
 * Ported verbatim from front. Drives the plan panel from the plan's presence,
 * so open/close work however the change arrived rather than depending on any
 * single (possibly dropped) signal. The caller carries `prev` across renders.
 *
 * - Open on empty -> present (a freshly created plan). "unknown" is the
 *   pre-settle state, so a plan already present on load does not auto-open.
 *   Never auto-opens on mobile.
 * - Close on present -> empty (the plan was closed), but only when the plan
 *   panel is the open one.
 */
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

// --- Plan task rows (Figma 14800:126251) -----------------------------------

export type PlanTaskState = "done" | "running" | "blocked" | "upcoming";

// Same marker set production counts in `PlanCard`.
const TASK_MARKER_REGEX = /^\s*-\s*\[([ xX!])\]/gm;

/**
 * `- [!]` is not GFM, so remark leaves it as literal text and the item never
 * becomes a task item. Rewriting it to `- [ ]` lets it render as one; the state
 * array below remembers that it was blocked.
 */
export function normalizePlanMarkdown(content: string): string {
  return content.replace(/^(\s*-\s*)\[!\]/gm, "$1[ ]");
}

/**
 * One state per task marker, in document order. The step in flight is the first
 * open task, so nothing beyond "is the plan running" has to be plumbed through.
 */
export function planTaskStates(
  content: string | null,
  { isRunning }: { isRunning: boolean }
): PlanTaskState[] {
  if (!content) {
    return [];
  }

  let runningTaken = false;

  return Array.from(content.matchAll(TASK_MARKER_REGEX)).map(([, marker]) => {
    if (marker === "x" || marker === "X") {
      return "done";
    }
    if (marker === "!") {
      return "blocked";
    }
    if (isRunning && !runningTaken) {
      runningTaken = true;
      return "running";
    }
    return "upcoming";
  });
}

/**
 * Each task row leads with a short bold title, taken from the start of the task's
 * own text — nothing new is written, the first few words are just set in bold and
 * the remainder stays regular.
 *
 * Prefers a break the author already put in (an em/en dash or a colon) when it
 * lands inside the word budget, so the bold run ends on a phrase rather than
 * mid-sentence; otherwise it hard-caps at `MAX_LEAD_WORDS`.
 *
 * The separator comes back on its own because Figma 15076:36759 colours it with
 * the lead rather than with the description.
 *
 * `lead + separator + rest` always reproduces the input exactly.
 */
const MAX_LEAD_WORDS = 6;

export function splitTaskLead(raw: string): {
  lead: string;
  separator: string;
  rest: string;
} {
  const text = raw.trimStart();

  const separator = text.match(/\s[—–]\s|:\s/);
  if (separator?.index !== undefined) {
    const head = text.slice(0, separator.index);
    if (head.trim().split(/\s+/).length <= MAX_LEAD_WORDS) {
      return {
        lead: head,
        separator: separator[0],
        rest: text.slice(separator.index + separator[0].length),
      };
    }
  }

  const words = /\S+\s*/g;
  let end = 0;
  for (let i = 0; i < MAX_LEAD_WORDS; i++) {
    const match = words.exec(text);
    if (!match) {
      return { lead: text, separator: "", rest: "" };
    }
    end = match.index + match[0].trimEnd().length;
  }

  return { lead: text.slice(0, end), separator: "", rest: text.slice(end) };
}

/**
 * Completing a task is two beats: the check is drawn inside its badge, and only
 * then is the text struck through.
 */
export const TASK_CHECK_MS = 260;
export const TASK_STRIKE_MS = 570;
export const TASK_COMPLETE_MS = TASK_CHECK_MS + TASK_STRIKE_MS;
