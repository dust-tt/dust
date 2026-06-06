import type { ActionApprovalStateType } from "@app/lib/actions/mcp";
import { useFetcher } from "@app/lib/swr/swr";
import type { MCPActionValidationRequest } from "@app/types/assistant/conversation";
import type { LightWorkspaceType } from "@app/types/user";
import { useCallback, useState } from "react";

export function useEditAndValidateAction({
  owner,
  onError,
}: {
  owner: LightWorkspaceType;
  onError: (errorMessage: string) => void;
}) {
  const { fetcher } = useFetcher();
  const [isEditingAndValidating, setIsEditingAndValidating] = useState(false);

  const editAndValidateAction = useCallback(
    async ({
      validationRequest,
      approvalState,
      editedArguments,
    }: {
      validationRequest: MCPActionValidationRequest;
      approvalState: ActionApprovalStateType;
      editedArguments: Record<string, unknown>;
    }) => {
      setIsEditingAndValidating(true);

      try {
        // Edit and validate the action. The backend resumes both the conversation
        // that contains the action and any blocked ancestor conversations.
        await fetcher(
          `/api/w/${owner.sId}/assistant/conversations/${validationRequest.conversationId}/messages/${validationRequest.messageId}/edit-and-validate-action`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              actionId: validationRequest.actionId,
              approvalState,
              editedArguments,
              resumeAncestorConversations: true,
            }),
          }
        );

        return { success: true };
      } catch {
        onError("Failed to edit and approve action. Please try again.");
        return { success: false };
      } finally {
        setIsEditingAndValidating(false);
      }
    },
    [owner.sId, onError, fetcher]
  );

  return { editAndValidateAction, isEditingAndValidating };
}
