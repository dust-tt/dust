import { ConfirmContext } from "@app/components/Confirm";
import {
  useConversations,
  useSpaceConversationsSummary,
} from "@app/hooks/conversations";
import { useSendNotification } from "@app/hooks/useNotification";
import { useFetcher } from "@app/lib/swr/swr";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";
import { isAPIErrorResponse } from "@app/types/error";
import type { SpaceType } from "@app/types/space";
import type { LightWorkspaceType } from "@app/types/user";
import { useCallback, useContext } from "react";

export function useMoveConversationToProject(owner: LightWorkspaceType) {
  const sendNotification = useSendNotification();
  const confirm = useContext(ConfirmContext);
  const { fetcherWithBody } = useFetcher();

  const { mutateConversations } = useConversations({ workspaceId: owner.sId });

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

      try {
        await fetcherWithBody([
          `/api/w/${owner.sId}/assistant/conversations/${conversation.sId}`,
          { spaceId: space.sId },
          "PATCH",
        ]);
      } catch (e) {
        sendNotification({
          title: "Error moving conversation.",
          description: isAPIErrorResponse(e)
            ? e.error.message
            : "An error occurred",
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
      fetcherWithBody,
    ]
  );
}
