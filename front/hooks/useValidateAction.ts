import { useCallback, useState } from "react";

import type { MCPValidationOutputType } from "@app/lib/actions/constants";
import type {
  ConversationWithoutContentType,
  LightAgentMessageType,
  LightWorkspaceType,
  MCPActionValidationRequest,
} from "@app/types";

interface UseValidateActionParams {
  owner: LightWorkspaceType;
  conversation: ConversationWithoutContentType | null;
  onError: (errorMessage: string) => void;
}

export function useValidateAction({
  owner,
  conversation,
  onError,
}: UseValidateActionParams) {
  const [isValidating, setIsValidating] = useState(false);

  const validateAction = useCallback(
    async ({
      validationRequest,
      message,
      approved,
    }: {
      validationRequest: MCPActionValidationRequest;
      message?: LightAgentMessageType;
      approved: MCPValidationOutputType;
    }) => {
      setIsValidating(true);

      const retryBlockedActions = async () => {
        if (
          conversation?.sId &&
          message &&
          conversation.sId !== validationRequest.conversationId
        ) {
          const response = await fetch(
            `/api/w/${owner.sId}/assistant/conversations/${conversation.sId}/messages/${message.sId}/retry?blocked_only=true`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
            }
          );

          if (!response.ok) {
            onError("Failed to resume conversation. Please try again.");
            return { success: false };
          }
        }
        return { success: true };
      };

      try {
        // Validate the action.
        const response = await fetch(
          `/api/w/${owner.sId}/assistant/conversations/${validationRequest.conversationId}/messages/${validationRequest.messageId}/validate-action`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              actionId: validationRequest.actionId,
              approved,
            }),
          }
        );

        if (!response.ok) {
          try {
            const errData = await response.json();
            if (errData?.error.type === "action_not_blocked") {
              // If the action is not blocked anymore, we consider the validation already
              // successful.  This can happen if multiple clients validate the same action. We
              // retry the blocked actions and return a success in that case.
              return await retryBlockedActions();
            }
          } catch {
            // ignore JSON parsing errors and fall through to generic error
          }

          onError("Failed to assess action approval. Please try again.");
          return { success: false };
        }

        // Retry on blocked tools on the main conversation if there is one that is != from the event's.
        return await retryBlockedActions();
      } catch (error) {
        onError("Failed to assess action approval. Please try again.");
        return { success: false };
      } finally {
        setIsValidating(false);
      }
    },
    [owner.sId, conversation?.sId, onError]
  );

  return { validateAction, isValidating };
}
