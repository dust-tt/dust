import { useConversationSidePanelContext } from "@app/components/assistant/conversation/ConversationSidePanelContext";
import { extractPlanTitle } from "@app/components/assistant/conversation/plan_mode/utils";
import {
  useClosePlan,
  usePlanFile,
} from "@app/hooks/conversations/usePlanFile";
import { useFeatureFlags } from "@app/lib/auth/AuthContext";
import {
  ContentMessageAction,
  ContentMessageInline,
  ListSelect,
  Trash04,
} from "@dust-tt/sparkle";
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
  const { content } = usePlanFile({
    // Skip the fetch entirely for workspaces without the plan_mode feature flag.
    conversationId: isPlanModeEnabled ? conversationId : null,
    workspaceId,
  });
  const { togglePanel } = useConversationSidePanelContext();
  const { closePlan, isClosing } = useClosePlan({
    workspaceId,
    conversationId,
  });

  const title = useMemo(() => extractPlanTitle(content), [content]);
  const progress = useMemo(() => countProgress(content), [content]);

  // No active plan (including post-close): `getActivePlanContent` returns null.
  if (!content) {
    return null;
  }

  return (
    <ContentMessageInline
      icon={ListSelect}
      variant="outline"
      className="mb-3 flex w-full bg-background dark:bg-background-night"
    >
      <button
        type="button"
        onClick={() => togglePanel({ type: "plan" })}
        className="flex w-full min-w-0 items-center gap-2 text-left"
      >
        <span className="min-w-0 truncate text-foreground dark:text-foreground-night">
          {title}
        </span>
        {progress.total > 0 && (
          <span className="shrink-0">
            {progress.done}/{progress.total} done
          </span>
        )}
      </button>
      <ContentMessageAction
        icon={Trash04}
        variant="ghost"
        size="xs"
        tooltip="Close plan"
        isLoading={isClosing}
        className="text-muted-foreground dark:text-muted-foreground-night"
        onClick={() => void closePlan()}
      />
    </ContentMessageInline>
  );
});
