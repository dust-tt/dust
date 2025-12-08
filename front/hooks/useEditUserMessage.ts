import { useSWRConfig } from "swr";

import { useSendNotification } from "@app/hooks/useNotification";
import { useSubmitFunction } from "@app/lib/client/utils";
import { clientFetch } from "@app/lib/egress/client";
import { normalizeError, toMentionType } from "@app/types";
import type { RichMention } from "@app/types/assistant/mentions";

export function useEditUserMessage({
  owner,
  conversationId,
}: {
  owner: { sId: string };
  conversationId: string;
}) {
  const sendNotification = useSendNotification();
  const { mutate } = useSWRConfig();

  const { submit: editMessage, isSubmitting } = useSubmitFunction(
    async ({
      messageId,
      content,
      mentions,
    }: {
      messageId: string;
      content: string;
      mentions: RichMention[];
    }) => {
      const apiMentions = mentions.map(toMentionType);

      const res = await clientFetch(
        `/api/w/${owner.sId}/assistant/conversations/${conversationId}/messages/${messageId}/edit`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            content,
            mentions: apiMentions,
          }),
        }
      );

      if (!res.ok) {
        sendNotification({
          title: "Failed to edit message",
          description: "Please try again.",
          type: "error",
        });
        return;
      }

      sendNotification({
        title: "Message edited",
        description: "Message has been edited successfully.",
        type: "success",
      });

      await mutate(
        (key) =>
          typeof key === "string" &&
          key.includes(
            `/api/w/${owner.sId}/assistant/conversations/${conversationId}`
          )
      );
    }
  );

  return {
    editMessage,
    isEditing: isSubmitting,
  };
}
