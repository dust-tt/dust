import { useFeatureFlags } from "@app/lib/auth/AuthContext";
import { useConversationGoal } from "@app/lib/swr/conversation_goals";
import type { GoalType } from "@app/types/assistant/goal";
import { assertNever } from "@app/types/shared/utils/assert_never";
import {
  ContentMessageAction,
  ContentMessageInline,
  PauseCircle,
  Target04,
} from "@dust-tt/sparkle";
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
      return assertNever(goal.status);
  }
}

export const GoalCard = React.memo(function GoalCard({
  branchId,
  conversationId,
  workspaceId,
}: GoalCardProps) {
  const { hasFeature } = useFeatureFlags();
  const isGoalModeEnabled = hasFeature("goal_mode");
  const { goal, canManage, isPausing, pauseGoal } = useConversationGoal({
    conversationId: isGoalModeEnabled ? conversationId : null,
    workspaceId,
    branchId,
  });
  const statusLabel = goal ? getStatusLabel(goal) : null;
  if (!goal || !statusLabel) {
    return null;
  }

  const isRunning = goal.status === "active";

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
      {canManage && isRunning && (
        <ContentMessageAction
          icon={PauseCircle}
          variant="ghost"
          size="xs"
          tooltip="Pause future goal turns"
          isLoading={isPausing}
          disabled={isPausing}
          onClick={() => void pauseGoal()}
        />
      )}
    </ContentMessageInline>
  );
});
