import { useBlockedActionsContext } from "@app/components/assistant/conversation/BlockedActionsProvider";
import { useConversationSidePanelContext } from "@app/components/assistant/conversation/ConversationSidePanelContext";
import {
  extractPlanTitle,
  extractTaskList,
} from "@app/components/assistant/conversation/plan_mode/utils";
import { usePlanFile } from "@app/hooks/conversations/usePlanFile";
import { useValidateAction } from "@app/hooks/useValidateAction";
import type { MCPValidationOutputType } from "@app/lib/actions/constants";
import type { BlockedToolExecution } from "@app/lib/actions/mcp";
import { useAuth } from "@app/lib/auth/AuthContext";
import type { LightWorkspaceType, UserType } from "@app/types/user";
import { Button, cn, DocumentTextIcon, Icon } from "@dust-tt/sparkle";
import { useState } from "react";

const TASK_PREVIEW_LIMIT = 8;

interface PendingPlanApprovalCardProps {
  triggeringUser: UserType | null;
  owner: LightWorkspaceType;
  blockedAction: BlockedToolExecution;
  conversationId: string;
  messageId: string;
}

export function PendingPlanApprovalCard({
  triggeringUser,
  owner,
  blockedAction,
  conversationId,
  messageId,
}: PendingPlanApprovalCardProps) {
  const { user } = useAuth();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const { removeCompletedAction, isActionPulsing, stopPulsingAction } =
    useBlockedActionsContext();
  const { validateAction, isValidating } = useValidateAction({
    owner,
    conversationId,
    onError: setErrorMessage,
  });
  const { openPanel } = useConversationSidePanelContext();
  const { content } = usePlanFile({
    conversationId,
    workspaceId: owner.sId,
  });

  const isTriggeredByCurrentUser = blockedAction.userId === user?.sId;
  const isPulsing = isActionPulsing(blockedAction.actionId);

  const title = extractPlanTitle(content);
  const tasks = extractTaskList(content);
  const visibleTasks = tasks.slice(0, TASK_PREVIEW_LIMIT);
  const hiddenTaskCount = tasks.length - visibleTasks.length;

  const handleValidation = async (approved: MCPValidationOutputType) => {
    stopPulsingAction(blockedAction.actionId);
    setErrorMessage(null);

    const result = await validateAction({
      validationRequest: blockedAction,
      messageId,
      approved,
    });

    if (!result.success) {
      setErrorMessage("Failed to assess action approval. Please try again.");
      return;
    }
    removeCompletedAction(blockedAction.actionId);
  };

  if (!isTriggeredByCurrentUser) {
    return (
      <div
        className={cn(
          "flex w-full items-center gap-2 rounded-2xl border px-4 py-3",
          "border-border-dark/50 bg-muted-background",
          "dark:border-border-dark-night/30 dark:bg-muted-background-night"
        )}
      >
        <Icon visual={DocumentTextIcon} size="sm" />
        <span className="copy-sm text-foreground dark:text-foreground-night">
          Waiting for{" "}
          <span className="font-semibold">{triggeringUser?.fullName}</span> to
          approve the plan.
        </span>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex w-full flex-col gap-3 rounded-2xl border px-4 py-3",
        "border-border-dark/50 bg-muted-background",
        "dark:border-border-dark-night/30 dark:bg-muted-background-night"
      )}
    >
      <div className="flex items-center gap-2">
        <Icon visual={DocumentTextIcon} size="sm" />
        <span className="heading-sm grow truncate">Plan: {title}</span>
        <Button
          variant="ghost"
          size="xs"
          label="Read full plan"
          onClick={() => openPanel({ type: "plan" })}
        />
      </div>
      {visibleTasks.length > 0 && (
        <ul className="copy-sm flex flex-col gap-1 pl-2">
          {visibleTasks.map((task, idx) => (
            <li key={idx} className="flex gap-2">
              <span aria-hidden>•</span>
              <span>{task}</span>
            </li>
          ))}
          {hiddenTaskCount > 0 && (
            <li className="text-muted-foreground dark:text-muted-foreground-night">
              +{hiddenTaskCount} more
            </li>
          )}
        </ul>
      )}
      {errorMessage && (
        <div className="copy-sm text-warning-800 dark:text-warning-800-night">
          {errorMessage}
        </div>
      )}
      <div className="flex items-center justify-end gap-2">
        <Button
          variant="ghost"
          size="sm"
          label="Cancel"
          disabled={isValidating}
          isPulsing={isPulsing}
          onClick={() => void handleValidation("rejected")}
        />
        {/* Edit will be wired in the follow-up that adds the input-bar chip. */}
        <Button variant="outline" size="sm" label="Edit" disabled />
        <Button
          variant="highlight"
          size="sm"
          label="Approve plan"
          disabled={isValidating}
          isPulsing={isPulsing}
          onClick={() => void handleValidation("approved")}
        />
      </div>
    </div>
  );
}
