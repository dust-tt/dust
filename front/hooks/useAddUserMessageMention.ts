import { useCallback } from "react";

import { useSendNotification } from "@app/hooks/useNotification";
import { clientFetch } from "@app/lib/egress/client";
import { serializeMention } from "@app/lib/mentions/format";
import type {
  LightAgentConfigurationType,
  LightWorkspaceType,
  UserMessageTypeWithContentFragments,
} from "@app/types";

export function useAddUserMessageMention({
  owner,
  conversationId,
}: {
  owner: LightWorkspaceType;
  conversationId: string | null;
}) {
  const sendNotification = useSendNotification();

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

      const response = await clientFetch(
        `/api/w/${owner.sId}/assistant/conversations/${conversationId}/messages/${userMessage.sId}/edit`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            content: editedContent,
            mentions: [
              {
                type: "agent",
                configurationId: agent.sId,
              },
            ],
          }),
        }
      );

      if (!response.ok) {
        const data = await response.json();
        sendNotification({
          type: "error",
          title: "Error adding mention to message",
          description: data.error.message,
        });
        return false;
      }

      return true;
    },
    [owner.sId, conversationId, sendNotification]
  );
}
