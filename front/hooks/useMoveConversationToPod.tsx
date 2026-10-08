import { ConfirmContext } from "@app/components/Confirm";
import {
  useConversations,
  usePodConversationsSummary,
} from "@app/hooks/conversations";
import {
  useSendApiErrorNotification,
  useSendNotification,
} from "@app/hooks/useNotification";
import { clientFetch } from "@app/lib/egress/client";
import { getErrorFromResponse } from "@app/lib/swr/swr";
import type { ConversationListItemType } from "@app/types/assistant/conversation";
import { getConversationDisplayTitle } from "@app/types/assistant/conversation";
import type { SpaceType } from "@app/types/space";
import type { LightWorkspaceType } from "@app/types/user";
import { plural } from "@lingui/core/macro";
import { Plural, Trans, useLingui } from "@lingui/react/macro";
import { useCallback, useContext } from "react";

export function useMoveConversationToPod(owner: LightWorkspaceType) {
  const { t } = useLingui();
  const sendApiErrorNotification = useSendApiErrorNotification();
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
      const conversationTitle = getConversationDisplayTitle(conversation);
      const podName = space.name;
      const confirmed = await confirm({
        title: t`Move conversation to Pod`,
        message: (
          <div>
            <Trans>
              The content of the conversation{" "}
              <strong>{conversationTitle}</strong> will be available to all
              members of the Pod <strong>{podName}</strong>.
            </Trans>
          </div>
        ),
        validateLabel: t`Move`,
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

        sendApiErrorNotification({
          title: t`Error moving conversation.`,
          error: errorData,
        });
        return false;
      }

      // Revalidate conversations list to reflect the move
      void mutateConversations((prev) =>
        prev?.filter((c) => c.sId !== conversation.sId)
      );
      void mutatePodConversationsSummary();
      void sendNotification({
        title: t`Conversation moved.`,
        description: t`The conversation has been moved to the Pod.`,
        type: "success",
      });

      return true;
    },
    [
      owner.sId,
      mutateConversations,
      mutatePodConversationsSummary,
      sendApiErrorNotification,
      sendNotification,
      confirm,
      t,
    ]
  );
}

export function useBulkMoveConversationsToPod(owner: LightWorkspaceType) {
  const { t } = useLingui();
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

      const podName = space.name;
      const confirmed = await confirm({
        title: t`Move conversations to Pod`,
        message: (
          <div>
            <Trans>
              The content of{" "}
              <Plural
                value={total}
                one="# conversation"
                other="# conversations"
              />{" "}
              will be available to all members of the Pod{" "}
              <strong>{podName}</strong>.
            </Trans>
          </div>
        ),
        validateLabel: t`Move`,
        validateVariant: "primary",
      });

      if (!confirmed) {
        return 0;
      }

      let successCount = 0;
      const movedConversationIds = new Set<string>();
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
          movedConversationIds.add(conversation.sId);
        }
      }

      if (movedConversationIds.size > 0) {
        void mutateConversations((prev) =>
          prev?.filter((c) => !movedConversationIds.has(c.sId))
        );
      }
      void mutatePodConversationsSummary();

      if (successCount === total) {
        sendNotification({
          type: "success",
          title: t`Conversations successfully moved`,
          description: t`${plural(total, {
            one: "# conversation has been moved to the Pod.",
            other: "# conversations have been moved to the Pod.",
          })}`,
        });
      } else if (successCount === 0) {
        sendNotification({
          type: "error",
          title: t`Failed to move conversations`,
          description: t`${plural(total, {
            one: "Could not move the selected conversation.",
            other: "Could not move the selected conversations.",
          })}`,
        });
      } else {
        sendNotification({
          type: "error",
          title: t`Some conversations couldn’t be moved`,
          description: t`Moved ${successCount} of ${total} conversations.`,
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
      t,
    ]
  );
}
