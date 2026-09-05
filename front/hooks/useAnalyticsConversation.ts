import { useConversation } from "@app/hooks/conversations/useConversation";
import { useConversations } from "@app/hooks/conversations/useConversations";
import { useCreateConversationWithMessage } from "@app/hooks/useCreateConversationWithMessage";
import { useSendNotification } from "@app/hooks/useNotification";
import type { DustError } from "@app/lib/error";
import type { ConversationType } from "@app/types/assistant/conversation";
import type { RichMention } from "@app/types/assistant/mentions";
import type { ContentFragmentsType } from "@app/types/content_fragment";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import type { UserType, WorkspaceType } from "@app/types/user";
import { useCallback, useMemo, useState } from "react";

/**
 * Creates and holds the single conversation for the Analytics conversation
 * panel, always mentioning `@analyst` on the first message. Creation is eager
 * on submit with the first message deferred, so `ConversationViewer` mounts
 * right away and renders its own optimistic placeholders (see
 * useCreateConversationWithMessage).
 *
 * Panel conversations are tagged with `analyticsPanel` in their metadata so
 * past ones can be listed and resumed from the panel's empty state.
 */
export function useAnalyticsConversation({
  owner,
  user,
  disabled,
}: {
  owner: WorkspaceType;
  user: UserType | null;
  disabled: boolean;
}) {
  const sendNotification = useSendNotification();
  const [conversation, setConversation] = useState<ConversationType | null>(
    null
  );
  const [pickedConversationId, setPickedConversationId] = useState<
    string | null
  >(null);

  const { conversations, mutateConversations } = useConversations({
    workspaceId: owner.sId,
    options: { disabled },
  });

  const pastConversations = useMemo(
    () => conversations.filter((c) => c.metadata?.analyticsPanel === true),
    [conversations]
  );

  const { conversation: pickedConversation } = useConversation({
    conversationId: pickedConversationId,
    workspaceId: owner.sId,
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
          richMentions: mentions,
        },
        metadata: { analyticsPanel: true },
        deferMessage: true,
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
      setPickedConversationId(null);
      await mutateConversations(
        (currentData) => [result.value, ...(currentData ?? [])],
        { revalidate: false }
      );

      return new Ok(undefined);
    },
    [createConversationWithMessage, mutateConversations, sendNotification]
  );

  const pickConversation = useCallback((conversationId: string) => {
    setConversation(null);
    setPickedConversationId(conversationId);
  }, []);

  const resetConversation = useCallback(() => {
    setConversation(null);
    setPickedConversationId(null);
  }, []);

  return {
    conversation: conversation ?? pickedConversation ?? null,
    isConversationLoading: pickedConversationId !== null && !pickedConversation,
    pastConversations,
    createConversation,
    pickConversation,
    resetConversation,
  };
}
