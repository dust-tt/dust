import { useVirtuosoMethods } from "@virtuoso.dev/message-list";
import React, { useMemo } from "react";

import { AgentMessage } from "@app/components/assistant/conversation/AgentMessage";
import { AttachmentCitation } from "@app/components/assistant/conversation/attachment/AttachmentCitation";
import { contentFragmentToAttachmentCitation } from "@app/components/assistant/conversation/attachment/utils";
import type { FeedbackSelectorProps } from "@app/components/assistant/conversation/FeedbackSelector";
import { MentionValidationRequired } from "@app/components/assistant/conversation/MentionValidationRequired";
import { MessageDateIndicator } from "@app/components/assistant/conversation/MessageDateIndicator";
import type {
  VirtuosoMessage,
  VirtuosoMessageListContext,
} from "@app/components/assistant/conversation/types";
import {
  getMessageDate,
  isHiddenMessage,
  isMessageTemporayState,
  isUserMessage,
} from "@app/components/assistant/conversation/types";
import { UserMessage } from "@app/components/assistant/conversation/UserMessage";
import { useMessageFeedback } from "@app/hooks/useMessageFeedback";
import { useSubmitFunction } from "@app/lib/client/utils";
import { clientFetch } from "@app/lib/egress/client";
import { classNames } from "@app/lib/utils";
import type { UserType } from "@app/types";

interface MessageItemProps {
  data: VirtuosoMessage;
  context: VirtuosoMessageListContext;
  index: number;
  nextData: VirtuosoMessage | null;
  prevData: VirtuosoMessage | null;
}

export const MessageItem = React.forwardRef<HTMLDivElement, MessageItemProps>(
  function MessageItem(
    { data, context, prevData, nextData }: MessageItemProps,
    ref
  ) {
    const sId = data.sId;

    const methods = useVirtuosoMethods<
      VirtuosoMessage,
      VirtuosoMessageListContext
    >();

    const submitFeedback = useMessageFeedback({
      owner: context.owner,
      conversationId: context.conversationId,
    });

    const { submit: onSubmitThumb, isSubmitting: isSubmittingThumb } =
      useSubmitFunction(
        async ({
          thumb,
          shouldRemoveExistingFeedback,
          feedbackContent,
          isConversationShared,
        }: {
          thumb: string;
          shouldRemoveExistingFeedback: boolean;
          feedbackContent: string | null;
          isConversationShared: boolean;
        }) => {
          await submitFeedback({
            messageId: sId,
            thumbDirection: thumb,
            feedbackContent,
            isConversationShared,
            shouldRemoveExistingFeedback,
          });
        }
      );

    const { submit: onReactionToggle } = useSubmitFunction(
      async ({ emoji }: { emoji: string }) => {
        const message = data;
        if (!isUserMessage(message) && !isMessageTemporayState(message)) {
          return;
        }

        const currentReactions =
          isUserMessage(message) || isMessageTemporayState(message)
            ? (message.reactions ?? [])
            : [];

        const hasReacted = currentReactions.some(
          (r) =>
            r.emoji === emoji &&
            r.users.some((u) => u.username === context.user.username)
        );

        const res = await clientFetch(
          `/api/w/${context.owner.sId}/assistant/conversations/${context.conversationId}/messages/${sId}/reactions`,
          {
            method: hasReacted ? "DELETE" : "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ reaction: emoji }),
          }
        );

        if (res.ok) {
          // Optimistically update the message reactions in the Virtuoso list
          methods.data.map((m) => {
            if (m.sId === sId) {
              const currentMsgReactions =
                isUserMessage(m) || isMessageTemporayState(m)
                  ? (m.reactions ?? [])
                  : [];

              let updatedReactions = currentMsgReactions;

              if (hasReacted) {
                // Remove user from this emoji's reaction
                updatedReactions = currentMsgReactions
                  .map((r) => {
                    if (r.emoji === emoji) {
                      return {
                        ...r,
                        users: r.users.filter(
                          (u) => u.username !== context.user.username
                        ),
                      };
                    }
                    return r;
                  })
                  .filter((r) => r.users.length > 0); // Remove empty reactions
              } else {
                // Add user to this emoji's reaction
                const existingReaction = currentMsgReactions.find(
                  (r) => r.emoji === emoji
                );
                if (existingReaction) {
                  updatedReactions = currentMsgReactions.map((r) => {
                    if (r.emoji === emoji) {
                      return {
                        ...r,
                        users: [
                          ...r.users,
                          {
                            userId: context.user.sId,
                            username: context.user.username,
                            fullName: context.user.fullName,
                          },
                        ],
                      };
                    }
                    return r;
                  });
                } else {
                  updatedReactions = [
                    ...currentMsgReactions,
                    {
                      emoji,
                      users: [
                        {
                          userId: context.user.sId,
                          username: context.user.username,
                          fullName: context.user.fullName,
                        },
                      ],
                    },
                  ];
                }
              }

              if (isUserMessage(m)) {
                return { ...m, reactions: updatedReactions };
              } else if (isMessageTemporayState(m)) {
                return { ...m, reactions: updatedReactions };
              }
            }
            return m;
          });
        }
      }
    );

    const messageFeedback = context.feedbacksByMessageId[sId];

    const messageFeedbackWithSubmit: FeedbackSelectorProps = {
      feedback: messageFeedback
        ? {
            thumb: messageFeedback.thumbDirection,
            feedbackContent: messageFeedback.content,
            isConversationShared: messageFeedback.isConversationShared,
          }
        : null,
      onSubmitThumb,
      isSubmittingThumb,
      owner: context.owner,
    };

    const citations =
      isUserMessage(data) && data.contentFragments.length > 0
        ? data.contentFragments.map((contentFragment, index) => {
            const attachmentCitation =
              contentFragmentToAttachmentCitation(contentFragment);

            return (
              <AttachmentCitation
                owner={context.owner}
                key={index}
                attachmentCitation={attachmentCitation}
                conversationId={context.conversationId}
              />
            );
          })
        : undefined;

    const areSameDate =
      prevData &&
      getMessageDate(prevData).toDateString() ===
        getMessageDate(data).toDateString();

    const triggeringUser = useMemo((): UserType | null => {
      if (isMessageTemporayState(data)) {
        const parentMessageId = data.parentMessageId;
        const messages = methods.data.get();
        const parentUserMessage = messages
          .filter(isUserMessage)
          .find((m) => m.sId === parentMessageId);
        return parentUserMessage?.user ?? null;
      } else {
        return data.user;
      }
    }, [data, methods.data]);

    if (isHiddenMessage(data)) {
      // This is hacky but in case of handover we generate a user message from the agent and we want to hide it in the conversation
      // because it has no value to display.
      return null;
    }

    return (
      <>
        {!areSameDate && <MessageDateIndicator message={data} />}
        <div
          key={`message-id-${sId}`}
          ref={ref}
          className={classNames("mx-auto min-w-60", "mb-4", "max-w-4xl")}
        >
          {isUserMessage(data) && (
            <UserMessage
              citations={citations}
              conversationId={context.conversationId}
              currentUserId={context.user.sId}
              isLastMessage={!nextData}
              message={data}
              owner={context.owner}
              onReactionToggle={(emoji: string) => onReactionToggle({ emoji })}
            />
          )}
          {isMessageTemporayState(data) && (
            <AgentMessage
              user={context.user}
              triggeringUser={triggeringUser}
              conversationId={context.conversationId}
              isLastMessage={!nextData}
              agentMessage={data}
              messageFeedback={messageFeedbackWithSubmit}
              owner={context.owner}
              handleSubmit={context.handleSubmit}
              onReactionToggle={(emoji: string) => onReactionToggle({ emoji })}
            />
          )}
          {data.visibility !== "deleted" &&
            data.richMentions
              .filter((mention) => mention.status === "pending")
              .map((mention) => (
                <MentionValidationRequired
                  key={mention.id}
                  pendingMention={mention}
                  message={data}
                  owner={context.owner}
                  triggeringUser={triggeringUser}
                  conversationId={context.conversationId}
                />
              ))}
        </div>
      </>
    );
  }
);
