import { useSWRConfig } from "swr";

import { useSendNotification } from "@app/hooks/useNotification";
import { useSubmitFunction } from "@app/lib/client/utils";

export function useDeleteMessage({
  owner,
  conversationId,
}: {
  owner: { sId: string };
  conversationId: string;
}) {
  const sendNotification = useSendNotification();
  const { mutate } = useSWRConfig();

  const { submit: deleteMessage, isSubmitting } = useSubmitFunction(
    async (messageId: string) => {
      const res = await fetch(
        `/api/w/${owner.sId}/assistant/conversations/${conversationId}/messages/${messageId}/delete`,
        {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error?.message || "Failed to delete message");
      }

      sendNotification({
        title: "Message deleted",
        description: "Your message has been deleted successfully.",
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
    deleteMessage,
    isDeleting: isSubmitting,
  };
}
