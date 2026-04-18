import { useSendNotification } from "@app/hooks/useNotification";
import { useFetcher } from "@app/lib/swr/swr";
import { isAPIErrorResponse } from "@app/types/error";
import type { LightWorkspaceType } from "@app/types/user";
import { useCallback, useState } from "react";

interface UseCompleteAuthenticationParams {
  owner: LightWorkspaceType;
}

export function useCompleteAuthentication({
  owner,
}: UseCompleteAuthenticationParams) {
  const sendNotification = useSendNotification();
  const { fetcher } = useFetcher();
  const [isCompleting, setIsCompleting] = useState(false);

  const completeAuthentication = useCallback(
    async ({
      conversationId,
      messageId,
      actionId,
    }: {
      conversationId: string;
      messageId: string;
      actionId: string;
    }) => {
      setIsCompleting(true);

      try {
        await fetcher(
          `/api/w/${owner.sId}/assistant/conversations/${conversationId}/messages/${messageId}/complete-authentication`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ actionId }),
          }
        );

        return { success: true };
      } catch (e) {
        if (isAPIErrorResponse(e) && e.error.type === "action_not_blocked") {
          return { success: true };
        }

        sendNotification({
          type: "error",
          title: "Failed to resume tool",
          description: "Failed to resume the authenticated tool. Please try again.",
        });
        return { success: false };
      } finally {
        setIsCompleting(false);
      }
    },
    [owner.sId, sendNotification, fetcher]
  );

  return { completeAuthentication, isCompleting };
}
