import { useCallback, useState } from "react";

import type { MCPValidationOutputType } from "@app/lib/actions/constants";
import { clientFetch } from "@app/lib/egress/client";
import type {
  LightWorkspaceType,
  MCPActionValidationRequest,
} from "@app/types";

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
        const response = await clientFetch(
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
              // directly return a success in that case.
              return { success: true };
            }
          } catch {
            // ignore JSON parsing errors and fall through to generic error
          }
          onError("Failed to assess action approval. Please try again.");
          return { success: false };
        }

        // Retry on blocked tools on the main conversation if there is one that is != from the event's.
        if (
          conversationId &&
          messageId &&
          conversationId !== validationRequest.conversationId
        ) {
          const response = await clientFetch(
            `/api/w/${owner.sId}/assistant/conversations/${conversationId}/messages/${messageId}/retry?blocked_only=true`,
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
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
      } catch (error) {
        onError("Failed to assess action approval. Please try again.");
        return { success: false };
      } finally {
        setIsValidating(false);
      }
    },
    [owner.sId, conversationId, onError]
  );

  return { validateAction, isValidating };
}
