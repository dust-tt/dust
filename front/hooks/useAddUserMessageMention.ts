import { useSendNotification } from "@app/hooks/useNotification";
import { serializeMention } from "@app/lib/mentions/format";
import { useFetcher } from "@app/lib/swr/swr";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import type { UserMessageTypeWithContentFragments } from "@app/types/assistant/conversation";
import { isAPIErrorResponse } from "@app/types/error";
import type { LightWorkspaceType } from "@app/types/user";
import { useCallback } from "react";

export function useAddUserMessageMention({
  owner,
  conversationId,
}: {
  owner: LightWorkspaceType;
  conversationId: string | null;
}) {
  const sendNotification = useSendNotification();
  const { fetcherWithBody } = useFetcher();

  return useCallback(
    async ({
      agent,
      userMessage,
    }: {
      agent: LightAgentConfigurationType;
      userMessage: UserMessageTypeWithContentFragments;
    }): Promise<boolean> => {
      if (!conversationId) {
        return false;
      }

      // Ensure proper formatting: if content starts with markdown that requires being at
      // the beginning of a line (code blocks, list items, etc.), add a newline after the
      // mention so the markdown remains valid.
      const contentStartsWithLineStartMarkdown = userMessage.content.match(
        /^(\s*)(```|`|---|\*\*\*|#{1,6}\s|[-*+]\s|>\s|\d+\.\s)/
      );
      const editedContent = contentStartsWithLineStartMarkdown
        ? `${serializeMention(agent)}\n\n${userMessage.content}`
        : `${serializeMention(agent)} ${userMessage.content}`;

      try {
        await fetcherWithBody([
          `/api/w/${owner.sId}/assistant/conversations/${conversationId}/messages/${userMessage.sId}/edit`,
          {
            content: editedContent,
            mentions: [
              {
                type: "agent",
                configurationId: agent.sId,
              },
            ],
          },
          "POST",
        ]);
      } catch (e) {
        if (isAPIErrorResponse(e)) {
          sendNotification({
            type: "error",
            title: "Error adding mention to message",
            description: e.error.message,
          });
        } else {
          sendNotification({
            type: "error",
            title: "Error adding mention to message",
            description: "An error occurred",
          });
        }
        return false;
      }

      return true;
    },
    [owner.sId, conversationId, sendNotification, fetcherWithBody]
  );
}
