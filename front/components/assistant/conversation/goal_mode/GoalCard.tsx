import { useConversationGoal } from "@app/hooks/conversations/useGoal";
import { useFeatureFlags } from "@app/lib/auth/AuthContext";
import type { GoalType } from "@app/types/assistant/goal";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import { ContentMessageInline, Target04 } from "@dust-tt/sparkle";
import React from "react";

interface GoalCardProps {
  branchId: string | null;
  conversationId: string | null;
  workspaceId: string;
}

function getStatusLabel(goal: GoalType): string | null {
  switch (goal.status) {
    case "active":
      return `Running · turn ${goal.turnCount}/${goal.maxTurns}`;
    case "paused":
      return "Paused";
    case "blocked":
      return "Blocked";
    case "completed":
    case "cancelled":
      return null;
    default:
      assertNeverAndIgnore(goal.status);
      return null;
  }
}

export const GoalCard = React.memo(function GoalCard({
  branchId,
  conversationId,
  workspaceId,
}: GoalCardProps) {
  const { hasFeature } = useFeatureFlags();
  const { goal } = useConversationGoal({
    conversationId: hasFeature("goal_mode") ? conversationId : null,
    workspaceId,
    branchId,
  });
  const statusLabel = goal ? getStatusLabel(goal) : null;
  if (!goal || !statusLabel) {
    return null;
  }

  return (
    <ContentMessageInline
      icon={Target04}
      variant="outline"
      className="mb-3 flex w-full bg-background"
    >
      <div className="flex min-w-0 flex-1 flex-col text-left">
        <span className="truncate text-foreground">{goal.objective}</span>
        <span className="truncate text-xs text-muted-foreground">
          {goal.reason ? `${statusLabel} · ${goal.reason}` : statusLabel}
        </span>
      </div>
    </ContentMessageInline>
  );
});
