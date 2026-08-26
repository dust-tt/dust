import { useConversations } from "@app/hooks/conversations/useConversations";
import { useCreateConversationWithMessage } from "@app/hooks/useCreateConversationWithMessage";
import { useSendNotification } from "@app/hooks/useNotification";
import type { DustError } from "@app/lib/error";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import type { ConversationType } from "@app/types/assistant/conversation";
import type { RichMention } from "@app/types/assistant/mentions";
import type { ContentFragmentsType } from "@app/types/content_fragment";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import type { UserType, WorkspaceType } from "@app/types/user";
import { useCallback, useState } from "react";

/**
 * Creates and holds the single conversation for the Analytics conversation
 * panel, always mentioning `@analyst` on the first message. There is no
 * draft: creation is eager, on submit, matching how every other client
 * conversation is created (see useCreateConversationWithMessage).
 */
export function useAnalyticsConversation({
  owner,
  user,
}: {
  owner: WorkspaceType;
  user: UserType | null;
}) {
  const sendNotification = useSendNotification();
  const [conversation, setConversation] = useState<ConversationType | null>(
    null
  );

  const { mutateConversations } = useConversations({
    workspaceId: owner.sId,
    options: { disabled: true },
  });

  const createConversationWithMessage = useCreateConversationWithMessage({
    owner,
    user,
  });

  const createConversation = useCallback(
    async (
      input: string,
      mentions: RichMention[],
      contentFragments: ContentFragmentsType
    ): Promise<Result<undefined, DustError>> => {
      const result = await createConversationWithMessage({
        messageData: {
          input,
          mentions: mentions.map((mention) => ({
            configurationId: mention.id,
          })),
          contentFragments,
        },
        title: `Ask ${GLOBAL_AGENTS_SID.ANALYST}`,
      });

      if (result.isErr()) {
        sendNotification({
          title: result.error.title,
          description: result.error.message,
          type: "error",
        });
        return new Err({
          code: "internal_error",
          name: result.error.title,
          message: result.error.message,
        });
      }

      setConversation(result.value);
      await mutateConversations(
        (currentData) => [result.value, ...(currentData ?? [])],
        { revalidate: false }
      );

      return new Ok(undefined);
    },
    [createConversationWithMessage, mutateConversations, sendNotification]
  );

  const resetConversation = useCallback(() => {
    setConversation(null);
  }, []);

  return {
    conversation,
    createConversation,
    resetConversation,
  };
}
