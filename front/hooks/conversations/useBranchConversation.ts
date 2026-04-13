import { useSendNotification } from "@app/hooks/useNotification";
import { clientFetch } from "@app/lib/egress/client";
import { useAppRouter } from "@app/lib/platform";
import { getErrorFromResponse } from "@app/lib/swr/swr";
import { getConversationRoute } from "@app/lib/utils/router";
import type { PostConversationForkResponseBody } from "@app/pages/api/w/[wId]/assistant/conversations/[cId]/forks";
import type { LightWorkspaceType } from "@app/types/user";
import { useCallback, useState } from "react";
import { useSWRConfig } from "swr";

export function useBranchConversation({
  owner,
  conversationId,
}: {
  owner: LightWorkspaceType;
  conversationId?: string | null;
}) {
  const sendNotification = useSendNotification();
  const router = useAppRouter();
  const { mutate } = useSWRConfig();

  const [isBranching, setIsBranching] = useState(false);

  const branchConversation = useCallback(async (): Promise<boolean> => {
    if (!conversationId) {
      return false;
    }

    setIsBranching(true);

    try {
      const res = await clientFetch(
        `/api/w/${owner.sId}/assistant/conversations/${conversationId}/forks`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({}),
        }
      );

      if (!res.ok) {
        const errorData = await getErrorFromResponse(res);

        sendNotification({
          type: "error",
          title: "Failed to branch conversation",
          description: errorData.message,
        });

        return false;
      }

      const { conversation }: PostConversationForkResponseBody =
        await res.json();

      await router.push(
        getConversationRoute(owner.sId, conversation.sId),
        undefined,
        {
          shallow: true,
        }
      );

      const conversationPathPrefix = `/api/w/${owner.sId}/assistant/conversations`;
      void mutate(
        (key) =>
          typeof key === "string" && key.startsWith(conversationPathPrefix)
      );

      return true;
    } catch {
      sendNotification({
        type: "error",
        title: "Failed to branch conversation",
      });

      return false;
    } finally {
      setIsBranching(false);
    }
  }, [conversationId, mutate, owner.sId, router, sendNotification]);

  return {
    branchConversation,
    isBranching,
  };
}
