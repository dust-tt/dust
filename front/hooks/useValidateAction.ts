import type { MCPValidationOutputType } from "@app/lib/actions/constants";
import { useFetcher } from "@app/lib/swr/swr";
import type { MCPActionValidationRequest } from "@app/types/assistant/conversation";
import { isAPIErrorResponse } from "@app/types/error";
import type { LightWorkspaceType } from "@app/types/user";
import { useCallback, useState } from "react";

interface UseValidateActionParams {
  owner: LightWorkspaceType;
  conversationId: string | null;
  onError: (errorMessage: string) => void;
}

export function useValidateAction({
  owner,
  conversationId,
  onError,
}: UseValidateActionParams) {
  const { fetcher } = useFetcher();
  const [isValidating, setIsValidating] = useState(false);

  const validateAction = useCallback(
    async ({
      validationRequest,
      messageId,
      approved,
    }: {
      validationRequest: MCPActionValidationRequest;
      messageId: string;
      approved: MCPValidationOutputType;
    }) => {
      setIsValidating(true);

      try {
        // Validate the action.
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
            }),
          }
        );

        // Retry on blocked tools on the main conversation if there is one that is != from the event's.
        if (
          conversationId &&
          messageId &&
          conversationId !== validationRequest.conversationId
        ) {
          try {
            await fetcher(
              `/api/w/${owner.sId}/assistant/conversations/${conversationId}/messages/${messageId}/retry?blocked_only=true`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                },
              }
            );
          } catch {
            onError("Failed to resume conversation. Please try again.");
            return { success: false };
          }
        }

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
    [owner.sId, conversationId, onError, fetcher]
  );

  return { validateAction, isValidating };
}
