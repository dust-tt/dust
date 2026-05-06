import type { PlanApprovalState } from "@app/pages/api/w/[wId]/assistant/conversations/[cId]/plan_mode";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import { Chip, cn } from "@dust-tt/sparkle";

const TITLE_REGEX = /^#\s+(.+)$/m;
const TASK_LINE_REGEX = /^\s*-\s*\[[ xX!]\]\s*(.+)$/gm;

export function extractPlanTitle(content: string | null): string {
  if (!content) {
    return "Untitled plan";
  }
  const match = content.match(TITLE_REGEX);
  return match ? match[1].trim() : "Untitled plan";
}

export function extractTaskList(content: string | null): string[] {
  if (!content) {
    return [];
  }
  return Array.from(content.matchAll(TASK_LINE_REGEX)).map((m) => m[1].trim());
}

const TASKS_HEADING_REGEX = /^##\s+Tasks?\s*$/m;

// Splits plan markdown around the "## Tasks" (or "## Task") heading so the
// preamble can render through Markdown while the task list itself is rendered
// as a custom component with the project's circle markers. The heading line
// stays in the preamble so it inherits Markdown heading styles.
export function splitPlanContent(content: string | null): {
  preamble: string;
  tasks: string[];
} {
  if (!content) {
    return { preamble: "", tasks: [] };
  }
  const match = content.match(TASKS_HEADING_REGEX);
  if (!match || match.index === undefined) {
    return { preamble: content, tasks: [] };
  }
  const splitIdx = match.index + match[0].length;
  return {
    preamble: content.slice(0, splitIdx),
    tasks: extractTaskList(content.slice(splitIdx)),
  };
}

// Outlined 16px circle used as a task marker in both the approval card and the
// side panel. `mt-0.5` vertically centers the 16px circle on the 20px first
// line of `copy-sm` text.
export function PlanTaskBullet() {
  return (
    <span
      aria-hidden
      className={cn(
        "mt-0.5 h-4 w-4 shrink-0 rounded-full border-2",
        "border-faint dark:border-faint-night"
      )}
    />
  );
}

export function ApprovalStateChip({ state }: { state: PlanApprovalState }) {
  switch (state) {
    case "approved":
      return <Chip size="mini" color="success" label="Approved" />;
    case "pending":
      return <Chip size="mini" color="golden" label="Pending approval" />;
    case "draft":
      return null;
    default:
      assertNeverAndIgnore(state);
      return null;
  }
}
