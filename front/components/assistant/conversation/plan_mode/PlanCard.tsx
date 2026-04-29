import { useConversationSidePanelContext } from "@app/components/assistant/conversation/ConversationSidePanelContext";
import {
  ApprovalStateChip,
  extractPlanTitle,
} from "@app/components/assistant/conversation/plan_mode/utils";
import { usePlanFile } from "@app/hooks/conversations/usePlanFile";
import { useFeatureFlags } from "@app/lib/auth/AuthContext";
import { ChevronRightIcon, cn, DocumentTextIcon, Icon } from "@dust-tt/sparkle";
import React, { useMemo } from "react";

interface PlanCardProps {
  conversationId: string | null;
  workspaceId: string;
}

// Total counts every task marker (open, done, blocked); done counts only checked boxes.
// `[!]` is "blocked" by convention and is intentionally excluded from the "done" set so the
// progress chip surfaces unfinished work.
const TASK_TOTAL_REGEX = /^\s*-\s*\[[ xX!]\]/gm;
const TASK_DONE_REGEX = /^\s*-\s*\[[xX]\]/gm;

function countProgress(content: string | null): {
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

export const PlanCard = React.memo(function PlanCard({
  conversationId,
  workspaceId,
}: PlanCardProps) {
  const { hasFeature } = useFeatureFlags();
  const isPlanModeEnabled = hasFeature("plan_mode");
  const { planFile, content, approvalState } = usePlanFile({
    // Skip the fetch entirely for workspaces without the plan_mode feature flag.
    conversationId: isPlanModeEnabled ? conversationId : null,
    workspaceId,
  });
  const { openPanel } = useConversationSidePanelContext();

  const title = useMemo(() => extractPlanTitle(content), [content]);
  const progress = useMemo(() => countProgress(content), [content]);

  // Hide the card until the plan has been edited at least once (version >= 2). The skeleton
  // upload from `create_plan` produces version 1; the first `edit_plan` bumps it to 2. This
  // matches the side-panel auto-open trigger so the card appears at the same moment the panel
  // first opens. `findActivePlanFile` already filters closed plans server-side, so `!planFile`
  // also covers the post-close_plan case.
  if (!planFile || planFile.version < 2) {
    return null;
  }

  return (
    <button
      type="button"
      onClick={() => openPanel({ type: "plan" })}
      className={cn(
        "mb-2 flex w-full items-center gap-2 rounded-2xl border px-4 py-3 text-left",
        "border-border-dark/50 bg-muted-background",
        "dark:border-border-dark-night/30 dark:bg-muted-background-night",
        "hover:bg-primary-50 dark:hover:bg-primary-50-night"
      )}
    >
      <Icon visual={DocumentTextIcon} size="sm" />
      <span className="heading-sm grow truncate">Plan: {title}</span>
      <ApprovalStateChip state={approvalState} />
      {progress.total > 0 && (
        <span className="copy-xs shrink-0 text-muted-foreground dark:text-muted-foreground-night">
          {progress.done}/{progress.total} done
        </span>
      )}
      <Icon visual={ChevronRightIcon} size="sm" />
    </button>
  );
});
