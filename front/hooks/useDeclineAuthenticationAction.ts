import { useCallback, useState } from "react";

import type { LightWorkspaceType } from "@app/types";

interface UseDismissBlockedActionsParams {
  owner: LightWorkspaceType;
  onError: (errorMessage: string) => void;
}

export function useDismissBlockedActions({
  owner,
  onError,
}: UseDismissBlockedActionsParams) {
  const [
    isDismissingActionRequiredActions,
    setIsDismissingActionRequiredActions,
  ] = useState(false);

  const dismissBlockedActions = useCallback(
    async ({ conversationIds }: { conversationIds: string[] }) => {
      setIsDismissingActionRequiredActions(true);

      try {
        const queryParams = new URLSearchParams();
        conversationIds.forEach((id) => {
          queryParams.append("conversationIds", id);
        });

        const response = await fetch(
          `/api/w/${owner.sId}/assistant/conversations/decline-blocked-actions?${queryParams.toString()}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
          }
        );

        if (!response.ok) {
          try {
            const errData = await response.json();
            if (errData?.error.type === "action_not_blocked") {
              // If the action is not blocked anymore, we consider the decline already
              // successful. This can happen if multiple clients decline the same action.
              return { success: true };
            }
          } catch {
            // ignore JSON parsing errors and fall through to generic error
          }
          onError("Failed to decline action. Please try again.");
          return { success: false };
        }

        return { success: true };
      } catch (error) {
        onError("Failed to decline action. Please try again.");
        return { success: false };
      } finally {
        setIsDismissingActionRequiredActions(false);
      }
    },
    [owner.sId, onError]
  );

  return {
    dismissBlockedActions,
    isDismissingActionRequiredActions: isDismissingActionRequiredActions,
  };
}
