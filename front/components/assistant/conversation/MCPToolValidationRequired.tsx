import { ToolValidationCard } from "@app/components/actions/blocked/ToolValidationCard";
import { useBlockedActionsContext } from "@app/components/assistant/conversation/BlockedActionsProvider";
import type { MCPValidationOutputType } from "@app/lib/actions/constants";
import type { AgentLoopBlockedToolExecution } from "@app/lib/actions/mcp";
import { useAuth } from "@app/lib/auth/AuthContext";
import { useValidateAction } from "@app/lib/swr/tool_actions";
import type { LightWorkspaceType, UserType } from "@app/types/user";
import { useState } from "react";

interface MCPToolValidationRequiredProps {
  triggeringUser: UserType | null;
  owner: LightWorkspaceType;
  blockedAction: AgentLoopBlockedToolExecution;
  conversationId?: string | null;
}

export function MCPToolValidationRequired({
  triggeringUser,
  owner,
  blockedAction,
  conversationId,
}: MCPToolValidationRequiredProps) {
  const { user } = useAuth();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const {
    getBlockedActions,
    removeCompletedAction,
    isActionPulsing,
    stopPulsingAction,
  } = useBlockedActionsContext();
  const { validateAction, isValidating } = useValidateAction({
    owner,
    onError: setErrorMessage,
  });

  const handleValidation = async (
    approved: MCPValidationOutputType
  ): Promise<boolean> => {
    // Stop pulsing immediately when the user takes an action.
    stopPulsingAction(blockedAction.actionId);

    setErrorMessage(null);

    const result = await validateAction({
      contextType: "agent_loop",
      conversationId: blockedAction.conversationId,
      messageId: blockedAction.messageId,
      actionId: blockedAction.actionId,
      approved,
    });

    if (!result.success) {
      setErrorMessage("Failed to assess action approval. Please try again.");
      return false;
    }
    removeCompletedAction(blockedAction.actionId);

    // When the user grants always-allow, cascade to other queued
    // confirmations of the same tool so they don't have to click each one.
    if (approved === "always_approved" && user) {
      const cascadable = getBlockedActions(user.sId).filter(
        (c) =>
          c.actionId !== blockedAction.actionId &&
          c.status === "blocked_validation_required" &&
          c.metadata.mcpServerName === blockedAction.metadata.mcpServerName &&
          c.metadata.toolName === blockedAction.metadata.toolName
      );

      for (const cascadeAction of cascadable) {
        const cascadeResult = await validateAction({
          contextType: "agent_loop",
          conversationId: cascadeAction.conversationId,
          messageId: cascadeAction.messageId,
          actionId: cascadeAction.actionId,
          approved: "approved",
        });
        if (cascadeResult.success) {
          removeCompletedAction(cascadeAction.actionId);
        }
      }
    }

    return true;
  };

  return (
    <ToolValidationCard
      validationRequest={blockedAction}
      triggeringUser={triggeringUser}
      owner={owner}
      conversationId={conversationId}
      errorMessage={errorMessage}
      isValidating={isValidating}
      isPulsing={isActionPulsing(blockedAction.actionId)}
      onValidate={handleValidation}
    />
  );
}
