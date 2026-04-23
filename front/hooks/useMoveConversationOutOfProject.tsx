import { ConfirmContext } from "@app/components/Confirm";
import {
  useConversation,
  useConversations,
  useSpaceConversationsSummary,
} from "@app/hooks/conversations";
import { useSendNotification } from "@app/hooks/useNotification";
import { clientFetch } from "@app/lib/egress/client";
import { getErrorFromResponse } from "@app/lib/swr/swr";
import {
  type ConversationListItemType,
  getConversationDisplayTitle,
} from "@app/types/assistant/conversation";
import type { LightWorkspaceType } from "@app/types/user";
import { useCallback, useContext } from "react";

export function useMoveConversationOutOfProject(
  owner: LightWorkspaceType,
  conversationId: string | null
) {
  const sendNotification = useSendNotification();
  const confirm = useContext(ConfirmContext);

  const { mutateConversations } = useConversations({
    workspaceId: owner.sId,
    options: { disabled: true },
  });

  const { mutate: mutateSpaceSummary } = useSpaceConversationsSummary({
    workspaceId: owner.sId,
    options: { disabled: true },
  });

  const { mutateConversation } = useConversation({
    conversationId,
    workspaceId: owner.sId,
    options: { disabled: true },
  });

  return useCallback(
    async (conversation: ConversationListItemType): Promise<boolean> => {
      const confirmed = await confirm({
        title: "Remove from project?",
        message: (
          <div>
            <strong>{getConversationDisplayTitle(conversation)}</strong> will be
            removed from the project. Participants who no longer have access to
            the required spaces will be removed from the conversation.
          </div>
        ),
        validateLabel: "Remove",
        validateVariant: "primary",
      });

      if (!confirmed) {
        return false;
      }
      const res = await clientFetch(
        `/api/w/${owner.sId}/assistant/conversations/${conversation.sId}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ removeFromProject: true }),
        }
      );

      if (!res.ok) {
        const errorData = await getErrorFromResponse(res);

        sendNotification({
          title: "Error removing conversation from project.",
          description: errorData.message,
          type: "error",
        });
        return false;
      }

      void mutateConversations();
      void mutateSpaceSummary();
      void mutateConversation();
      void sendNotification({
        title: "Conversation removed.",
        description: "The conversation has been removed from the project.",
        type: "success",
      });

      return true;
    },
    [
      owner.sId,
      mutateConversations,
      mutateSpaceSummary,
      mutateConversation,
      sendNotification,
      confirm,
    ]
  );
}
