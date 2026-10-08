import { useSendNotification } from "@app/hooks/useNotification";
import { useSubmitFunction } from "@app/lib/client/utils";
import { clientFetch } from "@app/lib/egress/client";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { useLingui } from "@lingui/react/macro";

export function useDeleteMessage({
  owner,
  conversationId,
}: {
  owner: { sId: string };
  conversationId: string;
}) {
  const { t } = useLingui();
  const sendNotification = useSendNotification();

  const { submit: deleteMessage, isSubmitting } = useSubmitFunction(
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
        title: t`Message deleted`,
        description: t`Message has been deleted successfully.`,
        type: "success",
      });
    }
  );

  return {
    deleteMessage,
    isDeleting: isSubmitting,
  };
}
