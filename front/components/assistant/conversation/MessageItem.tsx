import { AgentMessage } from "@app/components/assistant/conversation/AgentMessage";
import { AttachmentCitation } from "@app/components/assistant/conversation/attachment/AttachmentCitation";
import { contentFragmentToAttachmentCitation } from "@app/components/assistant/conversation/attachment/utils";
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
import { isSupportedImageContentType } from "@app/types/files";
import type { UserType } from "@app/types/user";
import { cn } from "@dust-tt/sparkle";
import { useVirtuosoMethods } from "@virtuoso.dev/message-list";
import React, { useMemo } from "react";

// Inter-message spacing lives here (not in Sparkle) because it depends on
// conversation-level context (who sent the message, steering flow, grouping).
// Sparkle message components only handle padding inside the bubble.
// The last message also gets a margin-bottom for breathing space (see MessageItem).
//
// - No margin: consecutive messages from the same user
// - mt-2: steered flow (steering user message or steered agent response)
// - mt-4: default gap between messages
// - mt-8: previous message has reactions (extra space to clear them)
function getMessageTopMargin({
  data,
  prevData,
  isPreviousMessageSameSender,
  isSteeredAgentMessage,
  isPreviousAgentMessageSteered,
}: {
  data: VirtuosoMessage;
  prevData: VirtuosoMessage | null;
  isPreviousMessageSameSender: boolean | null;
  isSteeredAgentMessage: boolean;
  isPreviousAgentMessageSteered: boolean;
}): string | undefined {
  // Previous message has reactions — add extra space to clear them.
  if (prevData && prevData.reactions.length > 0) {
    return "mt-8";
  }

  // Smaller margin when visually grouped (consecutive messages from the same user).
  if (isPreviousMessageSameSender) {
    return "mt-1";
  }

  // Steered flow: reduced margin to keep the steering user message and
  // steered agent response visually connected.
  if (isPreviousAgentMessageSteered || isSteeredAgentMessage) {
    return "mt-2";
  }

  return "mt-4";
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

    const hasImageCitation =
      isUserMessage(data) &&
      data.contentFragments.some((fragment) => {
        const attachmentCitation =
          contentFragmentToAttachmentCitation(fragment);
        return (
          attachmentCitation.type === "file" &&
          isSupportedImageContentType(attachmentCitation.contentType)
        );
      });

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
                compact={!hasImageCitation}
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

    const isAgentMessage = isAgentMessageWithStreaming(data);
    const configurationId = isAgentMessage ? data.configuration.sId : undefined;

    const isSteeredAgentMessage = useMemo((): boolean => {
      if (!isAgentMessage || !configurationId) {
        return false;
      }
      const messages = methods.data.get();
      const currentIndex = messages.findIndex((m) => m.sId === sId);
      for (let i = currentIndex - 1; i >= 0; i--) {
        const m = messages[i];
        if (isAgentMessageWithStreaming(m)) {
          // An agent message is considered steered if the previous agent message (skipping user
          // messages) is in gracefully_stopped or created state and from the same agent.
          return (
            (m.status === "gracefully_stopped" || m.status === "created") &&
            m.configuration.sId === configurationId
          );
        }
      }
      return false;
    }, [isAgentMessage, configurationId, sId, methods.data]);

    const parentMessageId = isAgentMessage ? data.parentMessageId : undefined;
    const messageUser = isUserMessage(data) ? data.user : null;

    // Hide the user message time header when it follows a created or gracefully stopped agent
    // message (steering flow) to save vertical space.
    const isPreviousAgentMessageSteered =
      prevData !== null &&
      isUserMessage(data) &&
      isAgentMessageWithStreaming(prevData) &&
      (prevData.status === "gracefully_stopped" ||
        prevData.status === "created");

    const triggeringUser = useMemo((): UserType | null => {
      if (isAgentMessage && parentMessageId) {
        const messages = methods.data.get();
        const parentUserMessage = messages
          .filter(isUserMessage)
          .find((m) => m.sId === parentMessageId);
        return parentUserMessage?.user ?? null;
      }
      return messageUser;
    }, [isAgentMessage, parentMessageId, messageUser, methods.data]);

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
          className={cn(
            "mx-auto max-w-conversation",
            topMargin,
            !nextData && "mb-4"
          )}
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
        </div>
      </>
    );
  }
);
