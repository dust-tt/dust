import { ToolValidationCard } from "@app/components/actions/blocked/ToolValidationCard";
import { useBlockedActionsContext } from "@app/components/assistant/conversation/BlockedActionsProvider";
import {
  EditableToolValidation,
  isEditableToolValidationSupported,
} from "@app/components/assistant/conversation/editable_tool_validation/EditableToolValidation";
import type { ValidationRequiredToolExecution } from "@app/components/assistant/conversation/editable_tool_validation/types";
import type { MCPValidationOutputType } from "@app/lib/actions/constants";
import { canCurrentUserRespondToParentUserMessage } from "@app/lib/api/assistant/conversation/can_current_user_respond";
import { useAuth, useFeatureFlags } from "@app/lib/auth/AuthContext";
import { useValidateAction } from "@app/lib/swr/tool_actions";
import type { LightWorkspaceType, UserType } from "@app/types/user";
import { useEffect, useMemo, useRef, useState } from "react";

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
  const { user } = useAuth();
  const { hasFeature } = useFeatureFlags();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const {
    getBlockedActions,
    getApprovalProgress,
    removeCompletedAction,
    isActionPulsing,
    stopPulsingAction,
    conversationApprovalEnabled,
    isToolApprovedForConversation,
    approveToolForConversation,
  } = useBlockedActionsContext();
  const { validateAction, isValidating } = useValidateAction({
    owner,
    onError: setErrorMessage,
  });

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
    setErrorMessage(null);
  };

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
    conversationApprovalEnabled &&
    canCurrentUserRespond &&
    isToolApprovedForConversation({ mcpServerName, toolName });

  const hasAutoApprovedRef = useRef(false);
  // `handleValidation` is recreated each render; the ref guard makes this fire once.
  // biome-ignore lint/correctness/useExhaustiveDependencies: handleValidation is intentionally excluded; the ref guard prevents re-firing
  useEffect(() => {
    if (isAutoApproved && !hasAutoApprovedRef.current) {
      hasAutoApprovedRef.current = true;
      void handleValidation("approved");
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
      <>
        <EditableToolValidation
          blockedAction={blockedAction}
          owner={owner}
          isPulsing={isPulsing}
          isValidating={isValidating}
          onActionCompleted={() =>
            removeCompletedAction(blockedAction.actionId)
          }
          onError={setErrorMessage}
          onValidationStart={handleValidationStart}
        />
        {errorMessage && (
          <div className="mt-2 text-sm font-medium text-warning-800">
            {errorMessage}
          </div>
        )}
      </>
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
      errorMessage={errorMessage}
      isValidating={isValidating}
      isPulsing={isPulsing}
      onValidate={handleValidation}
      onApproveForConversation={
        conversationApprovalEnabled ? handleApproveForConversation : undefined
      }
    />
  );
}
