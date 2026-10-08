import { ConfirmContext } from "@app/components/Confirm";
import {
  useConversation,
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
import type { LightWorkspaceType } from "@app/types/user";
import { Trans, useLingui } from "@lingui/react/macro";
import { useCallback, useContext } from "react";

export function useMoveConversationOutOfPod(
  owner: LightWorkspaceType,
  conversationId: string | null
) {
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

  const { mutateConversation } = useConversation({
    conversationId,
    workspaceId: owner.sId,
    options: { disabled: true },
  });

  return useCallback(
    async (conversation: ConversationListItemType): Promise<boolean> => {
      const conversationTitle = getConversationDisplayTitle(conversation);
      const confirmed = await confirm({
        title: t`Remove from Pod?`,
        message: (
          <div>
            <Trans>
              <strong>{conversationTitle}</strong> will be removed from the Pod.
              Participants who no longer have access to the required spaces will
              be removed from the conversation.
            </Trans>
          </div>
        ),
        validateLabel: t`Remove`,
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

        sendApiErrorNotification({
          title: t`Error removing conversation from Pod.`,
          error: errorData,
        });
        return false;
      }

      void mutateConversations(
        (prev) => {
          if (!prev) {
            return prev;
          }
          const personalConversation = { ...conversation, spaceId: null };
          return [
            personalConversation,
            ...prev.filter((c) => c.sId !== conversation.sId),
          ];
        },
        { revalidate: false }
      );
      void mutatePodConversationsSummary();
      void mutateConversation();
      void sendNotification({
        title: t`Conversation removed.`,
        description: t`The conversation has been removed from the Pod.`,
        type: "success",
      });

      return true;
    },
    [
      owner.sId,
      mutateConversations,
      mutatePodConversationsSummary,
      mutateConversation,
      sendApiErrorNotification,
      sendNotification,
      confirm,
      t,
    ]
  );
}
