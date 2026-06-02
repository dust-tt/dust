import { ConfirmContext } from "@app/components/Confirm";
import {
  useConversations,
  usePodConversationsSummary,
} from "@app/hooks/conversations";
import { useSendNotification } from "@app/hooks/useNotification";
import { clientFetch } from "@app/lib/egress/client";
import { getErrorFromResponse } from "@app/lib/swr/swr";
import {
  type ConversationListItemType,
  getConversationDisplayTitle,
} from "@app/types/assistant/conversation";
import type { SpaceType } from "@app/types/space";
import type { LightWorkspaceType } from "@app/types/user";
import { useCallback, useContext } from "react";

export function useMoveConversationToPod(owner: LightWorkspaceType) {
  const sendNotification = useSendNotification();
  const confirm = useContext(ConfirmContext);

  const { mutateConversations } = useConversations({
    workspaceId: owner.sId,
    options: { disabled: true },
  });

  const { mutate: mutatePodConversationsSummary } = usePodConversationsSummary({
    workspaceId: owner.sId,
    options: { disabled: true },
  });

  return useCallback(
    async (
      conversation: ConversationListItemType,
      space: SpaceType
    ): Promise<boolean> => {
      const confirmed = await confirm({
        title: "Move conversation to Pod",
        message: (
          <div>
            The content of the conversation{" "}
            <strong>{getConversationDisplayTitle(conversation)}</strong> will be
            available to all members of the Pod <strong>{space.name}</strong>.
          </div>
        ),
        validateLabel: "Move",
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
          body: JSON.stringify({ spaceId: space.sId }),
        }
      );

      if (!res.ok) {
        const errorData = await getErrorFromResponse(res);

        sendNotification({
          title: "Error moving conversation.",
          description: errorData.message,
          type: "error",
        });
        return false;
      }

      // Revalidate conversations list to reflect the move
      void mutateConversations((prev) =>
        prev?.filter((c) => c.sId !== conversation.sId)
      );
      void mutatePodConversationsSummary();
      void sendNotification({
        title: "Conversation moved.",
        description: "The conversation has been moved to the Pod.",
        type: "success",
      });

      return true;
    },
    [
      owner.sId,
      mutateConversations,
      mutatePodConversationsSummary,
      sendNotification,
      confirm,
    ]
  );
}

export function useBulkMoveConversationsToPod(owner: LightWorkspaceType) {
  const sendNotification = useSendNotification();
  const confirm = useContext(ConfirmContext);

  const { mutateConversations } = useConversations({
    workspaceId: owner.sId,
    options: { disabled: true },
  });

  const { mutate: mutatePodConversationsSummary } = usePodConversationsSummary({
    workspaceId: owner.sId,
    options: { disabled: true },
  });

  return useCallback(
    async (
      conversations: ConversationListItemType[],
      space: SpaceType
    ): Promise<number> => {
      const conversationsToMove = conversations.filter(
        (conversation) => conversation.spaceId !== space.sId
      );
      const total = conversationsToMove.length;

      if (total === 0) {
        return 0;
      }

      const confirmed = await confirm({
        title: "Move conversations to Pod",
        message: (
          <div>
            The content of {total} conversation{total > 1 ? "s" : ""} will be
            available to all members of the Pod <strong>{space.name}</strong>.
          </div>
        ),
        validateLabel: "Move",
        validateVariant: "primary",
      });

      if (!confirmed) {
        return 0;
      }

      let successCount = 0;
      const movedConversationSIds = new Set<string>();
      for (const conversation of conversationsToMove) {
        const res = await clientFetch(
          `/api/w/${owner.sId}/assistant/conversations/${conversation.sId}`,
          {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ spaceId: space.sId }),
          }
        );

        if (res.ok) {
          successCount += 1;
          movedConversationSIds.add(conversation.sId);
        }
      }

      if (movedConversationSIds.size > 0) {
        void mutateConversations((prev) =>
          prev?.filter((c) => !movedConversationSIds.has(c.sId))
        );
      }
      void mutatePodConversationsSummary();

      if (successCount === total) {
        sendNotification({
          type: "success",
          title: "Conversations successfully moved",
          description: `${total} conversation${total > 1 ? "s" : ""} have been moved to the Pod.`,
        });
      } else if (successCount === 0) {
        sendNotification({
          type: "error",
          title: "Failed to move conversations",
          description: `Could not move the selected ${total > 1 ? "conversations" : "conversation"}.`,
        });
      } else {
        sendNotification({
          type: "error",
          title: "Some conversations couldn’t be moved",
          description: `Moved ${successCount} of ${total} conversations.`,
        });
      }

      return successCount;
    },
    [
      owner.sId,
      mutateConversations,
      mutatePodConversationsSummary,
      sendNotification,
      confirm,
    ]
  );
}
