import { AgentMessage } from "@app/components/assistant/conversation/AgentMessage";
import { AttachmentCitation } from "@app/components/assistant/conversation/attachment/AttachmentCitation";
import { contentFragmentToAttachmentCitation } from "@app/components/assistant/conversation/attachment/utils";
import { ButlerSuggestionCard } from "@app/components/assistant/conversation/ButlerSuggestionCard";
import type { FeedbackSelectorBaseProps } from "@app/components/assistant/conversation/FeedbackSelector";
import { MentionInvalid } from "@app/components/assistant/conversation/MentionInvalid";
import { MentionValidationRequired } from "@app/components/assistant/conversation/MentionValidationRequired";
import { MessageDateIndicator } from "@app/components/assistant/conversation/MessageDateIndicator";
import type {
  VirtuosoMessage,
  VirtuosoMessageListContext,
} from "@app/components/assistant/conversation/types";
import {
  getMessageDate,
  isAgentMessageWithStreaming,
  isHiddenMessage,
  isUserMessage,
} from "@app/components/assistant/conversation/types";
import { UserMessage } from "@app/components/assistant/conversation/UserMessage";
import { useMessageFeedback } from "@app/hooks/useMessageFeedback";
import { useReaction } from "@app/hooks/useReaction";
import { useSubmitFunction } from "@app/lib/client/utils";
import type { UserType } from "@app/types/user";
import { cn } from "@dust-tt/sparkle";
import { useVirtuosoMethods } from "@virtuoso.dev/message-list";
import React, { useMemo } from "react";

// Inter-message spacing lives here (not in Sparkle) because it depends on
// conversation-level context (who sent the message, steering flow, grouping).
// Sparkle message components only handle padding inside the bubble.
// The last message also gets a margin-bottom for breathing space (see MessageItem).
function getMessageTopMargin({
  data,
  prevData,
  currentUserId,
  isPreviousMessageSameSender,
  isSteeredAgentMessage,
  isPreviousAgentMessageSteered,
}: {
  data: VirtuosoMessage;
  prevData: VirtuosoMessage | null;
  currentUserId: string;
  isPreviousMessageSameSender: boolean | null;
  isSteeredAgentMessage: boolean;
  isPreviousAgentMessageSteered: boolean;
}): string | undefined {
  // Previous message has reactions — add extra space to clear them.
  if (prevData && prevData.reactions.length > 0) {
    return "mt-8";
  }

  // No margin when visually grouped with the previous message.
  if (
    isPreviousMessageSameSender ||
    isSteeredAgentMessage ||
    isPreviousAgentMessageSteered
  ) {
    return undefined;
  }

  // Other users' messages get extra spacing.
  if (isUserMessage(data) && data.user?.sId !== currentUserId) {
    return "mt-3";
  }

  // Agent messages have no visible bubble background, so they need
  // more top margin to compensate for the lack of internal padding.
  if (isAgentMessageWithStreaming(data)) {
    return "mt-4";
  }

  return "mt-1";
}

interface MessageItemProps {
  allowBranchMessages?: boolean;
  data: VirtuosoMessage;
  context: VirtuosoMessageListContext;
  nextData: VirtuosoMessage | null;
  prevData: VirtuosoMessage | null;
  onAgentMessageCompletionStatusClick?: (messageId: string) => void;
}

export const MessageItem = React.forwardRef<HTMLDivElement, MessageItemProps>(
  function MessageItem(
    {
      allowBranchMessages,
      data,
      context,
      prevData,
      nextData,
      onAgentMessageCompletionStatusClick,
    }: MessageItemProps,
    ref
  ) {
    const sId = data.sId;

    const methods = useVirtuosoMethods<
      VirtuosoMessage,
      VirtuosoMessageListContext
    >();

    const submitFeedback = useMessageFeedback({
      owner: context.owner,
      conversationId: context.conversation?.sId,
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

    const { onReactionToggle } = useReaction({
      owner: context.owner,
      conversationId: context.conversation?.sId,
      message: data,
    });

    const messageFeedback = context.feedbacksByMessageId[sId];

    const messageFeedbackWithSubmit: FeedbackSelectorBaseProps = {
      feedback: messageFeedback
        ? {
            thumb: messageFeedback.thumbDirection,
            feedbackContent: messageFeedback.content,
            isConversationShared: messageFeedback.isConversationShared,
          }
        : null,
      onSubmitThumb,
      isSubmittingThumb,
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
                conversationId={context.conversation?.sId}
              />
            );
          })
        : undefined;

    const areSameDate =
      prevData &&
      getMessageDate(prevData).toDateString() ===
        getMessageDate(data).toDateString();

    const isPreviousMessageSameSender =
      prevData &&
      isUserMessage(data) &&
      isUserMessage(prevData) &&
      data.user?.sId !== undefined &&
      data.user.sId === prevData.user?.sId &&
      getMessageDate(prevData).toDateString() ===
        getMessageDate(data).toDateString();

    const isSteeredAgentMessage = useMemo((): boolean => {
      if (!isAgentMessageWithStreaming(data)) {
        return false;
      }
      const messages = methods.data.get();
      const currentIndex = messages.findIndex((m) => m.sId === data.sId);
      for (let i = currentIndex - 1; i >= 0; i--) {
        const m = messages[i];
        if (isAgentMessageWithStreaming(m)) {
          // An agent message is considered steered if the previous agent message (skipping user
          // messages) is in gracefully_stopped or created state and from the same agent.
          return (
            (m.status === "gracefully_stopped" || m.status === "created") &&
            m.configuration.sId === data.configuration.sId
          );
        }
      }
      return false;
    }, [data, methods.data]);

    // Hide the user message time header when it follows a created or gracefully stopped agent
    // message (steering flow) to save vertical space.
    const isPreviousAgentMessageSteered =
      prevData !== null &&
      isUserMessage(data) &&
      isAgentMessageWithStreaming(prevData) &&
      (prevData.status === "gracefully_stopped" ||
        prevData.status === "created");

    const triggeringUser = useMemo((): UserType | null => {
      if (isAgentMessageWithStreaming(data)) {
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

    if (!allowBranchMessages && data.branchId) {
      return null;
    }

    if (isHiddenMessage(data)) {
      // This is hacky but in case of handover we generate a user message from the agent and we want
      // to hide it in the conversation because it has no value to display.
      return null;
    }

    // No message without a conversation
    if (!context.conversation) {
      return null;
    }

    const topMargin = getMessageTopMargin({
      data,
      prevData,
      currentUserId: context.user.sId,
      isPreviousMessageSameSender,
      isSteeredAgentMessage,
      isPreviousAgentMessageSteered,
    });

    return (
      <>
        {!areSameDate && <MessageDateIndicator message={data} />}
        <div
          key={`message-id-${sId}`}
          ref={ref}
          className={cn("mx-auto max-w-conversation", topMargin, !nextData && "mb-4")}
        >
          {isUserMessage(data) && (
            <UserMessage
              citations={citations}
              conversationId={context.conversation.sId}
              currentUserId={context.user.sId}
              isFirstInGroup={
                !isPreviousMessageSameSender && !isPreviousAgentMessageSteered
              }
              isLastMessage={!nextData}
              message={data}
              owner={context.owner}
              onReactionToggle={(emoji: string) => onReactionToggle({ emoji })}
            />
          )}
          {isAgentMessageWithStreaming(data) && (
            <AgentMessage
              user={context.user}
              triggeringUser={triggeringUser}
              conversationId={context.conversation.sId}
              hideHeader={isSteeredAgentMessage}
              isLastMessage={!nextData}
              isSteered={isSteeredAgentMessage}
              agentMessage={data}
              messageFeedback={messageFeedbackWithSubmit}
              owner={context.owner}
              handleSubmit={context.handleSubmit}
              isOnboardingConversation={context.isOnboardingConversation}
              onCompletionStatusClick={onAgentMessageCompletionStatusClick}
              additionalMarkdownComponents={
                context.additionalMarkdownComponents
              }
              additionalMarkdownPlugins={context.additionalMarkdownPlugins}
            />
          )}
          {data.visibility !== "deleted" &&
            data.richMentions.map((mention, index) => {
              // To please the type checker
              if (!context.conversation) {
                return null;
              }

              // :warning: make sure to use the index in the key, as the mention.id is the userId

              if (
                mention.status === "pending_conversation_access" ||
                mention.status === "pending_project_membership"
              ) {
                return (
                  <MentionValidationRequired
                    key={index}
                    mention={mention}
                    message={data}
                    owner={context.owner}
                    triggeringUser={triggeringUser}
                    conversation={context.conversation}
                  />
                );
              } else if (
                mention.status === "user_restricted_by_conversation_access" ||
                mention.status === "agent_restricted_by_space_usage"
              ) {
                return (
                  <MentionInvalid
                    key={index}
                    mention={mention}
                    message={data}
                    owner={context.owner}
                    triggeringUser={triggeringUser}
                    conversation={context.conversation}
                  />
                );
              }
            })}
          {context.suggestionsByMessageSId.get(data.sId)?.map((suggestion) => (
            <ButlerSuggestionCard
              key={suggestion.sId}
              suggestion={suggestion}
              onAction={context.handleSuggestionAction}
            />
          ))}
        </div>
      </>
    );
  }
);
