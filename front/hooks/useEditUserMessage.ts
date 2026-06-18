import type { WorkspaceLimit } from "@app/components/app/ReachedLimitPopup";
import { getWorkspaceLimitFromApiErrorType } from "@app/components/app/ReachedLimitPopup";
import { useSendNotification } from "@app/hooks/useNotification";
import { useSubmitFunction } from "@app/lib/client/utils";
import { clientFetch } from "@app/lib/egress/client";
import type { RichMention } from "@app/types/assistant/mentions";
import { toMentionType } from "@app/types/assistant/mentions";
import { isAPIErrorResponse } from "@app/types/error";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

export function useEditUserMessage({
  owner,
  conversationId,
}: {
  owner: { sId: string };
  conversationId: string;
}) {
  const sendNotification = useSendNotification();

  const { submit: editMessage, isSubmitting } = useSubmitFunction(
    async ({
      messageId,
      content,
      mentions,
    }: {
      messageId: string;
      content: string;
      mentions: RichMention[];
    }): Promise<Result<void, WorkspaceLimit>> => {
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
        const body = await res.json().catch(() => null);
        if (isAPIErrorResponse(body)) {
          const limitCode = getWorkspaceLimitFromApiErrorType(body.error.type);
          if (limitCode) {
            return new Err(limitCode);
          }
        }
        sendNotification({
          title: "Failed to edit message",
          description: "Please try again.",
          type: "error",
        });
        return new Ok(undefined);
      }

      sendNotification({
        title: "Message edited",
        description: "Message has been edited successfully.",
        type: "success",
      });
      return new Ok(undefined);
    }
  );

  return {
    editMessage,
    isEditing: isSubmitting,
  };
}
