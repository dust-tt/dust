import { useCallback, useContext } from "react";

import { ConfirmContext } from "@app/components/Confirm";
import { useSendNotification } from "@app/hooks/useNotification";
import { clientFetch } from "@app/lib/egress/client";
import {
  useConversations,
  useSpaceConversationsSummary,
} from "@app/lib/swr/conversations";
import { getErrorFromResponse } from "@app/lib/swr/swr";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";
import type { SpaceType } from "@app/types/space";
import type { LightWorkspaceType } from "@app/types/user";

export function useMoveConversationToProject(owner: LightWorkspaceType) {
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

  return useCallback(
    async (
      conversation: ConversationWithoutContentType,
      space: SpaceType
    ): Promise<boolean> => {
      const confirmed = await confirm({
        title: "Move conversation to project",
        message: (
          <div>
            The content of the conversation{" "}
            <strong>{conversation.title}</strong> will be available to all
            members of the project <strong>{space.name}</strong>.
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
      void mutateConversations();
      void mutateSpaceSummary();
      void sendNotification({
        title: "Conversation moved.",
        description: "The conversation has been moved to the project.",
        type: "success",
      });

      return true;
    },
    [
      owner.sId,
      mutateConversations,
      mutateSpaceSummary,
      sendNotification,
      confirm,
    ]
  );
}
