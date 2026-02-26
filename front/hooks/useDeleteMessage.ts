import { useSendNotification } from "@app/hooks/useNotification";
import { useSubmitFunction } from "@app/lib/client/utils";
import { useFetcher } from "@app/lib/swr/swr";

export function useDeleteMessage({
  owner,
  conversationId,
}: {
  owner: { sId: string };
  conversationId: string;
}) {
  const sendNotification = useSendNotification();
  const { fetcher } = useFetcher();

  const { submit: deleteMessage, isSubmitting } = useSubmitFunction(
    async (messageId: string) => {
      await fetcher(
        `/api/w/${owner.sId}/assistant/conversations/${conversationId}/messages/${messageId}`,
        {
          method: "DELETE",
        }
      );

      sendNotification({
        title: "Message deleted",
        description: "Message has been deleted successfully.",
        type: "success",
      });
    }
  );

  return {
    deleteMessage,
    isDeleting: isSubmitting,
  };
}
