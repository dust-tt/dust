import { ToolValidationCard } from "@app/components/actions/blocked/ToolValidationCard";
import { useBlockedActionsContext } from "@app/components/assistant/conversation/BlockedActionsProvider";
import {
  EditableToolValidation,
  isEditableToolValidationSupported,
} from "@app/components/assistant/conversation/editable_tool_validation/EditableToolValidation";
import type { ValidationRequiredToolExecution } from "@app/components/assistant/conversation/editable_tool_validation/types";
import { useSendApiErrorNotification } from "@app/hooks/useNotification";
import type { MCPValidationOutputType } from "@app/lib/actions/constants";
import { canCurrentUserRespondToParentUserMessage } from "@app/lib/api/assistant/conversation/can_current_user_respond";
import { useAuth, useFeatureFlags } from "@app/lib/auth/AuthContext";
import { useValidateAction } from "@app/lib/swr/tool_actions";
import type { LightWorkspaceType, UserType } from "@app/types/user";
import { useLingui } from "@lingui/react/macro";
import { useEffect, useMemo, useRef } from "react";

interface MCPToolValidationRequiredProps {
  triggeringUser: UserType | null;
  owner: LightWorkspaceType;
  blockedAction: ValidationRequiredToolExecution;
  conversationId?: string | null;
}

export function MCPToolValidationRequired({
  triggeringUser,
  owner,
  blockedAction,
  conversationId,
}: MCPToolValidationRequiredProps) {
  const { t } = useLingui();
  const { user } = useAuth();
  const { hasFeature } = useFeatureFlags();
  const sendApiErrorNotification = useSendApiErrorNotification();

  const {
    getBlockedActions,
    getApprovalProgress,
    removeCompletedAction,
    isActionPulsing,
    stopPulsingAction,
    isToolApprovedForConversation,
    approveToolForConversation,
  } = useBlockedActionsContext();
  const { validateAction, isValidating } = useValidateAction({ owner });

  const canCurrentUserRespond = useMemo(
    () =>
      canCurrentUserRespondToParentUserMessage({
        parentUserId: blockedAction.userId,
        currentUserId: user?.sId,
      }),
    [blockedAction.userId, user?.sId]
  );

  const isPulsing = isActionPulsing(blockedAction.actionId);

  const approvalProgress = user
    ? getApprovalProgress({
        actionId: blockedAction.actionId,
        userId: user.sId,
      })
    : undefined;

  const handleValidationStart = () => {
    // Stop pulsing immediately when the user takes an action.
    stopPulsingAction(blockedAction.actionId);
  };

  /**
   * @cc [owner:achilleburah,label:security;product] always-allow-cascades-queued-calls
   * "Always allow" must apply "always_approved" to all queued calls to the same tool
   * (mcpServerName/toolName) for this user in this conversation.
   */
  const handleValidation = async (
    approved: MCPValidationOutputType
  ): Promise<boolean> => {
    handleValidationStart();

    const result = await validateAction({
      contextType: "agent_loop",
      conversationId: blockedAction.conversationId,
      messageId: blockedAction.messageId,
      actionId: blockedAction.actionId,
      approved,
    });

    if (!result.success) {
      sendApiErrorNotification({
        title: t`Failed to assess action approval`,
        error: result.error,
      });
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
          approved: "always_approved",
        });
        if (cascadeResult.success) {
          removeCompletedAction(cascadeAction.actionId);
        }
      }
    }

    return true;
  };

  const { mcpServerName, toolName } = blockedAction.metadata;

  // Grant an ephemeral, conversation-scoped approval for this tool, then unblock
  // the current action as a one-off "approved" (nothing is persisted server-side).
  const handleApproveForConversation = async (): Promise<boolean> => {
    approveToolForConversation({ mcpServerName, toolName });
    return handleValidation("approved");
  };

  /**
   * @cc [owner:tdraier,label:react;product] conversation-approval-auto-submit
   * When the tool has an ephemeral conversation approval and the current user can
   * respond, the blocked action MUST be auto-submitted once as "approved" (never
   * "always_approved", which would persist) and the validation card MUST NOT be
   * rendered. Auto-submission MUST fire at most once per mounted action.
   */
  const isAutoApproved =
    canCurrentUserRespond &&
    isToolApprovedForConversation({ mcpServerName, toolName });

  // Keep a ref to the latest `handleValidation` so the one-shot auto-approve
  // effect never fires with a stale closure while depending only on the trigger.
  // The ref is synced in an effect (not during render) to keep render pure.
  const handleValidationRef = useRef(handleValidation);
  useEffect(() => {
    handleValidationRef.current = handleValidation;
  });

  const hasAutoApprovedRef = useRef(false);
  useEffect(() => {
    if (isAutoApproved && !hasAutoApprovedRef.current) {
      hasAutoApprovedRef.current = true;
      void handleValidationRef.current("approved");
    }
  }, [isAutoApproved]);

  if (isAutoApproved) {
    return null;
  }

  const shouldUseEditableToolValidation =
    canCurrentUserRespond &&
    hasFeature("editable_tool_inputs") &&
    isEditableToolValidationSupported(blockedAction);

  if (shouldUseEditableToolValidation) {
    return (
      <EditableToolValidation
        blockedAction={blockedAction}
        owner={owner}
        isPulsing={isPulsing}
        isValidating={isValidating}
        onActionCompleted={() => removeCompletedAction(blockedAction.actionId)}
        onValidationStart={handleValidationStart}
      />
    );
  }

  return (
    <ToolValidationCard
      validationRequest={blockedAction}
      approvalProgress={approvalProgress}
      triggeringUser={triggeringUser}
      currentUser={user}
      owner={owner}
      conversationId={conversationId}
      isValidating={isValidating}
      isPulsing={isPulsing}
      onValidate={handleValidation}
      onApproveForConversation={handleApproveForConversation}
    />
  );
}
