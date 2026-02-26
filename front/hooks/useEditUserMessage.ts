import { useSendNotification } from "@app/hooks/useNotification";
import { useSubmitFunction } from "@app/lib/client/utils";
import { useFetcher } from "@app/lib/swr/swr";
import type { RichMention } from "@app/types/assistant/mentions";
import { toMentionType } from "@app/types/assistant/mentions";

export function useEditUserMessage({
  owner,
  conversationId,
}: {
  owner: { sId: string };
  conversationId: string;
}) {
  const sendNotification = useSendNotification();
  const { fetcherWithBody } = useFetcher();

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

      try {
        await fetcherWithBody([
          `/api/w/${owner.sId}/assistant/conversations/${conversationId}/messages/${messageId}/edit`,
          {
            content,
            mentions: apiMentions,
          },
          "POST",
        ]);
      } catch {
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
    }
  );

  return {
    editMessage,
    isEditing: isSubmitting,
  };
}
