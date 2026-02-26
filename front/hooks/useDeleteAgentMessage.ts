import { useSendNotification } from "@app/hooks/useNotification";
import { useSubmitFunction } from "@app/lib/client/utils";
import { useFetcher } from "@app/lib/swr/swr";

export function useDeleteAgentMessage({
  owner,
  conversationId,
}: {
  owner: { sId: string };
  conversationId: string;
}) {
  const sendNotification = useSendNotification();
  const { fetcher } = useFetcher();

  const { submit: deleteAgentMessage, isSubmitting } = useSubmitFunction(
    async (messageId: string) => {
      await fetcher(
        `/api/w/${owner.sId}/assistant/conversations/${conversationId}/messages/${messageId}`,
        {
          method: "DELETE",
        }
      );

      sendNotification({
        title: "Message deleted",
        description: "The agent message has been deleted successfully.",
        type: "success",
      });
    }
  );

  return {
    deleteAgentMessage,
    isDeleting: isSubmitting,
  };
}
