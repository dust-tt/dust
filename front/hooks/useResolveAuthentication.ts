import { useSendNotification } from "@app/hooks/useNotification";
import type { ResolveAuthenticationKind } from "@app/lib/api/assistant/conversation/resolve_authentication";
import { useFetcher } from "@app/lib/swr/swr";
import { isAPIErrorResponse } from "@app/types/error";
import type { LightWorkspaceType } from "@app/types/user";
import { useCallback, useState } from "react";

type ResolveAuthenticationOutcome = "completed" | "denied";

const ROUTE_FOR_KIND: Record<ResolveAuthenticationKind, string> = {
  authentication: "resolve-authentication",
  file_authorization: "resolve-file-authorization",
};

const LABEL_FOR_KIND: Record<ResolveAuthenticationKind, string> = {
  authentication: "authentication",
  file_authorization: "file authorization",
};

interface UseResolveAuthenticationParams {
  owner: LightWorkspaceType;
  kind?: ResolveAuthenticationKind;
}

export function useResolveAuthentication({
  owner,
  kind = "authentication",
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
          `/api/w/${owner.sId}/assistant/conversations/${conversationId}/messages/${messageId}/${ROUTE_FOR_KIND[kind]}`,
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
          title: `Failed to resolve ${LABEL_FOR_KIND[kind]}`,
          description: `Failed to resume the ${LABEL_FOR_KIND[kind]} tool. Please try again.`,
        });
        return { success: false };
      } finally {
        setIsCompleting(false);
      }
    },
    [owner.sId, sendNotification, fetcher, kind]
  );

  return { resolveAuthentication, isResolving: isCompleting };
}
