import { useBlockedActionsContext } from "@app/components/assistant/conversation/BlockedActionsProvider";
import { useConversationSidePanelContext } from "@app/components/assistant/conversation/ConversationSidePanelContext";
import { PlanTaskBullet } from "@app/components/assistant/conversation/plan_mode/PlanTaskBullet";
import { parsePlan } from "@app/components/assistant/conversation/plan_mode/utils";
import { usePlanFile } from "@app/hooks/conversations/usePlanFile";
import { useValidateAction } from "@app/hooks/useValidateAction";
import type { MCPValidationOutputType } from "@app/lib/actions/constants";
import type { BlockedToolExecution } from "@app/lib/actions/mcp";
import { useAuth } from "@app/lib/auth/AuthContext";
import type { LightWorkspaceType, UserType } from "@app/types/user";
import {
  ActionListCheckIcon,
  Button,
  cn,
  Icon,
  Markdown,
} from "@dust-tt/sparkle";
import { useState } from "react";

const CARD_CONTAINER_CLASSES = cn(
  "flex w-full rounded-2xl border p-4",
  "border-border-dark/50 bg-background",
  "dark:border-border-dark-night/30 dark:bg-background-night"
);

function PlanIconBadge() {
  return (
    <span
      className={cn(
        "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border",
        "border-border-dark bg-muted-background",
        "dark:border-border-dark-night dark:bg-muted-background-night"
      )}
    >
      <Icon visual={ActionListCheckIcon} size="sm" />
    </span>
  );
}

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

  const isTriggeredByCurrentUser = blockedAction.userId === user?.sId;

  const { removeCompletedAction } = useBlockedActionsContext();
  const { validateAction, isValidating } = useValidateAction({
    owner,
    conversationId,
    onError: setErrorMessage,
  });
  const { openPanel } = useConversationSidePanelContext();
  const { content } = usePlanFile({
    // Skip the fetch when waiting on another user — we only render their name.
    conversationId: isTriggeredByCurrentUser ? conversationId : null,
    workspaceId: owner.sId,
  });

  const { title, tasks } = parsePlan(content);

  const handleValidation = async (approved: MCPValidationOutputType) => {
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
      <div className={cn(CARD_CONTAINER_CLASSES, "items-center gap-3")}>
        <PlanIconBadge />
        <span className="copy-base text-foreground dark:text-foreground-night">
          Waiting for{" "}
          <span className="font-semibold">{triggeringUser?.fullName}</span> to
          approve the plan.
        </span>
      </div>
    );
  }

  return (
    <div className={cn(CARD_CONTAINER_CLASSES, "flex-col")}>
      <div className="flex items-center gap-3">
        <PlanIconBadge />
        <span className="heading-base grow truncate">Plan: {title}</span>
        <Button
          variant="outline"
          size="xs"
          label="Read full plan"
          onClick={() => openPanel({ type: "plan" })}
        />
      </div>
      {tasks.length > 0 && (
        <ul className="copy-sm mt-6 flex flex-col gap-5 font-medium text-primary dark:text-primary-night">
          {tasks.map((task, idx) => (
            <li key={`${idx}-${task}`} className="flex items-start gap-2 py-2">
              <PlanTaskBullet />
              <Markdown content={task} compactSpacing />
            </li>
          ))}
        </ul>
      )}
      {errorMessage && (
        <div className="copy-sm mt-3 text-warning-800 dark:text-warning-800-night">
          {errorMessage}
        </div>
      )}
      <div className="mt-3 flex items-center justify-between gap-2">
        <Button
          variant="outline"
          size="sm"
          label="Cancel"
          disabled={isValidating}
          onClick={() => void handleValidation("rejected")}
        />
        <Button
          variant="highlight"
          size="sm"
          label="Approve plan"
          disabled={isValidating}
          onClick={() => void handleValidation("approved")}
        />
      </div>
    </div>
  );
}
