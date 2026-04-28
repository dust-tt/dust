import type { MCPValidationOutputType } from "@app/lib/actions/constants";
import { useFetcher } from "@app/lib/swr/swr";
import type { MCPActionValidationRequest } from "@app/types/assistant/conversation";
import { isAPIErrorResponse } from "@app/types/error";
import type { LightWorkspaceType } from "@app/types/user";
import { useCallback, useState } from "react";

interface UseValidateActionParams {
  owner: LightWorkspaceType;
  onError: (errorMessage: string) => void;
}

export function useValidateAction({ owner, onError }: UseValidateActionParams) {
  const { fetcher } = useFetcher();
  const [isValidating, setIsValidating] = useState(false);

  const validateAction = useCallback(
    async ({
      validationRequest,
      approved,
    }: {
      validationRequest: MCPActionValidationRequest;
      approved: MCPValidationOutputType;
    }) => {
      setIsValidating(true);

      try {
        // Validate the action. The backend resumes both the conversation that
        // contains the action and any blocked ancestor conversations.
        await fetcher(
          `/api/w/${owner.sId}/assistant/conversations/${validationRequest.conversationId}/messages/${validationRequest.messageId}/validate-action`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              actionId: validationRequest.actionId,
              approved,
              resumeAncestorConversations: true,
            }),
          }
        );

        return { success: true };
      } catch (e) {
        if (isAPIErrorResponse(e) && e.error.type === "action_not_blocked") {
          // If the action is not blocked anymore, we consider the validation already
          // successful. This can happen if multiple clients validate the same action.
          return { success: true };
        }
        onError("Failed to assess action approval. Please try again.");
        return { success: false };
      } finally {
        setIsValidating(false);
      }
    },
    [owner.sId, onError, fetcher]
  );

  return { validateAction, isValidating };
}
