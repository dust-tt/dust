import { useSWRConfig } from "swr";

import { useSendNotification } from "@app/hooks/useNotification";
import { useSubmitFunction } from "@app/lib/client/utils";
import { clientFetch } from "@app/lib/egress/client";
import { normalizeError } from "@app/types";

export function useDeleteAgentMessage({
  owner,
  conversationId,
}: {
  owner: { sId: string };
  conversationId: string;
}) {
  const sendNotification = useSendNotification();
  const { mutate } = useSWRConfig();

  const { submit: deleteAgentMessage, isSubmitting } = useSubmitFunction(
    async (messageId: string) => {
      const res = await clientFetch(
        `/api/w/${owner.sId}/assistant/conversations/${conversationId}/messages/${messageId}`,
        {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      if (!res.ok) {
        const errorData = await res.json();
        throw normalizeError(errorData);
      }

      sendNotification({
        title: "Message deleted",
        description: "The agent message has been deleted successfully.",
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
    deleteAgentMessage,
    isDeleting: isSubmitting,
  };
}
