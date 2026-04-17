import { useSendNotification } from "@app/hooks/useNotification";
import { clientFetch } from "@app/lib/egress/client";
import type { PatchConversationsRequestBody } from "@app/pages/api/w/[wId]/assistant/conversations/[cId]";
import type { ConversationUrlAccessMode } from "@app/types/assistant/conversation";
import type { LightWorkspaceType } from "@app/types/user";
import { useCallback, useState } from "react";
import { useConversation } from "./useConversation";
import { useConversations } from "./useConversations";

interface UseConversationUrlAccessModeProps {
  owner: LightWorkspaceType;
  conversationId: string | null;
}

export function useConversationUrlAccessMode({
  owner,
  conversationId,
}: UseConversationUrlAccessModeProps) {
  const sendNotification = useSendNotification();
  const { mutateConversation } = useConversation({
    conversationId,
    workspaceId: owner.sId,
    options: { disabled: true },
  });
  const { mutateConversations } = useConversations({ workspaceId: owner.sId });
  const [
    isUpdatingConversationUrlAccessMode,
    setIsUpdatingConversationUrlAccessMode,
  ] = useState(false);

  const updateConversationUrlAccessMode = useCallback(
    async (accessMode: ConversationUrlAccessMode): Promise<boolean> => {
      if (!conversationId || isUpdatingConversationUrlAccessMode) {
        return false;
      }

      setIsUpdatingConversationUrlAccessMode(true);
      try {
        const response = await clientFetch(
          `/api/w/${owner.sId}/assistant/conversations/${conversationId}`,
          {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              accessMode,
            } satisfies PatchConversationsRequestBody),
          }
        );

        if (!response.ok) {
          sendNotification({
            type: "error",
            title: "Failed to update URL access",
          });
          return false;
        }

        const metadataPatch = { urlAccessMode: accessMode };
        void mutateConversation(
          (previousData) =>
            previousData?.conversation
              ? {
                  ...previousData,
                  conversation: {
                    ...previousData.conversation,
                    metadata: {
                      ...previousData.conversation.metadata,
                      ...metadataPatch,
                    },
                  },
                }
              : previousData,
          { revalidate: false }
        );
        void mutateConversations(
          (previousConversations) =>
            previousConversations?.map((conversation) =>
              conversation.sId === conversationId
                ? {
                    ...conversation,
                    metadata: {
                      ...conversation.metadata,
                      ...metadataPatch,
                    },
                  }
                : conversation
            ),
          { revalidate: false }
        );
        sendNotification({
          type: "success",
          title:
            accessMode === "workspace_members"
              ? "URL is now accessible"
              : "URL access restricted",
        });
        return true;
      } finally {
        setIsUpdatingConversationUrlAccessMode(false);
      }
    },
    [
      conversationId,
      isUpdatingConversationUrlAccessMode,
      mutateConversation,
      mutateConversations,
      owner.sId,
      sendNotification,
    ]
  );

  return {
    isUpdatingConversationUrlAccessMode,
    updateConversationUrlAccessMode,
  };
}
