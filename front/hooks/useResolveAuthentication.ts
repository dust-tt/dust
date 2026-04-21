import { useSendNotification } from "@app/hooks/useNotification";
import { useFetcher } from "@app/lib/swr/swr";
import { isAPIErrorResponse } from "@app/types/error";
import type { LightWorkspaceType } from "@app/types/user";
import { useCallback, useState } from "react";

type ResolveAuthenticationOutcome = "completed" | "denied";

interface UseResolveAuthenticationParams {
  owner: LightWorkspaceType;
}

export function useResolveAuthentication({
  owner,
}: UseResolveAuthenticationParams) {
  const sendNotification = useSendNotification();
  const { fetcher } = useFetcher();
  const [isCompleting, setIsCompleting] = useState(false);

  const resolveAuthentication = useCallback(
    async ({
      conversationId,
      messageId,
      actionId,
      outcome,
    }: {
      conversationId: string;
      messageId: string;
      actionId: string;
      outcome: ResolveAuthenticationOutcome;
    }) => {
      setIsCompleting(true);

      try {
        await fetcher(
          `/api/w/${owner.sId}/assistant/conversations/${conversationId}/messages/${messageId}/resolve-authentication`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ actionId, outcome }),
          }
        );

        return { success: true };
      } catch (e) {
        if (isAPIErrorResponse(e) && e.error.type === "action_not_blocked") {
          return { success: true };
        }

        sendNotification({
          type: "error",
          title: "Failed to resolve authentication",
          description:
            "Failed to resume the authenticated tool. Please try again.",
        });
        return { success: false };
      } finally {
        setIsCompleting(false);
      }
    },
    [owner.sId, sendNotification, fetcher]
  );

  return { resolveAuthentication, isResolving: isCompleting };
}
