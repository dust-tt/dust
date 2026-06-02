import { useFetcher } from "@app/lib/swr/swr";
import type { MCPActionValidationRequest } from "@app/types/assistant/conversation";
import { isAPIErrorResponse } from "@app/types/error";
import type { LightWorkspaceType } from "@app/types/user";
import { useCallback, useState } from "react";

interface UseEditAndSendActionParams {
  owner: LightWorkspaceType;
  onError: (errorMessage: string) => void;
}

export function useEditAndSendAction({
  owner,
  onError,
}: UseEditAndSendActionParams) {
  const { fetcher } = useFetcher();
  const [isEditing, setIsEditing] = useState(false);

  const editAndSendAction = useCallback(
    async ({
      validationRequest,
      editedInputs,
    }: {
      validationRequest: MCPActionValidationRequest;
      editedInputs: Record<string, unknown>;
    }) => {
      setIsEditing(true);

      try {
        await fetcher(
          `/api/w/${owner.sId}/assistant/conversations/${validationRequest.conversationId}/messages/${validationRequest.messageId}/edit-and-send-action`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              actionId: validationRequest.actionId,
              editedInputs,
            }),
          }
        );

        return { success: true };
      } catch (e) {
        if (isAPIErrorResponse(e) && e.error.type === "action_not_blocked") {
          return { success: true };
        }
        onError("Failed to edit and send action. Please try again.");
        return { success: false };
      } finally {
        setIsEditing(false);
      }
    },
    [owner.sId, onError, fetcher]
  );

  return { editAndSendAction, isEditing };
}
