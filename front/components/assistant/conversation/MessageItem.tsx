import { AgentMessage } from "@app/components/assistant/conversation/AgentMessage";
import { AttachmentCitation } from "@app/components/assistant/conversation/attachment/AttachmentCitation";
import { contentFragmentToAttachmentCitation } from "@app/components/assistant/conversation/attachment/utils";
import { CompactionMessage } from "@app/components/assistant/conversation/CompactionMessage";
import { ConversationForkNotice } from "@app/components/assistant/conversation/ConversationForkNotice";
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
  isCompactionMessage,
  isConversationForkNotice,
  isHiddenMessage,
  isUserMessage,
} from "@app/components/assistant/conversation/types";
import { UserMessage } from "@app/components/assistant/conversation/UserMessage";
import { WakeUpMessage } from "@app/components/assistant/conversation/WakeUpMessage";
import { useMessageFeedback } from "@app/hooks/useMessageFeedback";
import { useReaction } from "@app/hooks/useReaction";
import { useSubmitFunction } from "@app/lib/client/utils";
import { extractKnowledgeTagReferences } from "@app/lib/knowledge/format";
import { isContentNodeContentFragment } from "@app/types/content_fragment";
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
  if (
    prevData &&
    !isConversationForkNotice(prevData) &&
    !isCompactionMessage(prevData) &&
    prevData.reactions.length > 0
  ) {
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

  return "mt-8";
}

function getMessageSpacing(
  data: VirtuosoMessage,
  prevData: VirtuosoMessage | null,
  isSteeredAgentMessage: boolean
) {
  const areSameDate =
    prevData !== null &&
    getMessageDate(prevData).toDateString() ===
      getMessageDate(data).toDateString();

  const isPreviousMessageSameSender =
    prevData !== null &&
    areSameDate &&
    isUserMessage(data) &&
    isUserMessage(prevData) &&
    data.user?.sId !== undefined &&
    data.user.sId === prevData.user?.sId;

  const isPreviousAgentMessageSteered =
    prevData !== null &&
    isUserMessage(data) &&
    isAgentMessageWithStreaming(prevData) &&
    (prevData.status === "gracefully_stopped" || prevData.status === "created");

  const topMargin = getMessageTopMargin({
    data,
    prevData,
    isPreviousMessageSameSender,
    isSteeredAgentMessage,
    isPreviousAgentMessageSteered,
  });

  return {
    areSameDate,
    isPreviousMessageSameSender,
    isPreviousAgentMessageSteered,
    topMargin,
  };
}

function useMessageCitations(data: VirtuosoMessage) {
  return useMemo(() => {
    if (!isUserMessage(data)) {
      return undefined;
    }

    let visibleContentFragments = data.contentFragments;
    if (data.contentFragments.some(isContentNodeContentFragment)) {
      const inlineKnowledgeReferences = extractKnowledgeTagReferences(
        data.content
      );
      if (inlineKnowledgeReferences.length > 0) {
        visibleContentFragments = data.contentFragments.filter(
          (fragment) =>
            !(
              isContentNodeContentFragment(fragment) &&
              fragment.nodeId &&
              inlineKnowledgeReferences.some(
                (reference) =>
                  reference.id === fragment.nodeId &&
                  (!reference.dataSourceViewId ||
                    reference.dataSourceViewId ===
                      fragment.nodeDataSourceViewId)
              )
            )
        );
      }
    }

    const hasImageCitation = visibleContentFragments.some((fragment) => {
      const attachmentCitation = contentFragmentToAttachmentCitation(fragment);
      return (
        attachmentCitation.type === "file" &&
        isSupportedImageContentType(attachmentCitation.contentType)
      );
    });

    return visibleContentFragments.length > 0
      ? visibleContentFragments.map((contentFragment, index) => (
          <AttachmentCitation
            key={index}
            attachmentCitation={contentFragmentToAttachmentCitation(
              contentFragment
            )}
            size={hasImageCitation ? "md" : "sm"}
          />
        ))
      : undefined;
  }, [data]);
}

function useMessageActors(data: VirtuosoMessage) {
  const sId = data.sId;
  const isAgentMessage = isAgentMessageWithStreaming(data);
  const configurationId = isAgentMessage ? data.configuration.sId : undefined;
  const parentMessageId = isAgentMessage ? data.parentMessageId : undefined;
  const messageUser = isUserMessage(data) ? data.user : null;
  const methods = useVirtuosoMethods<
    VirtuosoMessage,
    VirtuosoMessageListContext
  >();

  const isSteeredAgentMessage = useMemo(() => {
    if (!isAgentMessage || !configurationId) {
      return false;
    }
    const messages = methods.data.get();
    const currentIndex = messages.findIndex((message) => message.sId === sId);
    for (let i = currentIndex - 1; i >= 0; i--) {
      const message = messages[i];
      if (isAgentMessageWithStreaming(message)) {
        return (
          (message.status === "gracefully_stopped" ||
            message.status === "created") &&
          message.configuration.sId === configurationId
        );
      }
    }
    return false;
  }, [isAgentMessage, configurationId, sId, methods.data]);

  const triggeringUser = useMemo((): UserType | null => {
    if (isAgentMessage && parentMessageId) {
      const parentUserMessage = methods.data
        .get()
        .filter(isUserMessage)
        .find((message) => message.sId === parentMessageId);
      return parentUserMessage?.user ?? null;
    }
    return messageUser;
  }, [isAgentMessage, parentMessageId, messageUser, methods.data]);

  return { isSteeredAgentMessage, triggeringUser };
}

interface MessageMentionsProps {
  data: Extract<VirtuosoMessage, { richMentions: unknown[] }>;
  owner: VirtuosoMessageListContext["owner"];
  conversation: NonNullable<VirtuosoMessageListContext["conversation"]>;
  triggeringUser: UserType | null;
}

function MessageMentions({
  data,
  owner,
  conversation,
  triggeringUser,
}: MessageMentionsProps) {
  if (data.visibility === "deleted") {
    return null;
  }

  return data.richMentions
    .filter((mention, index, mentions) => {
      if (mention.status !== "agent_restricted_by_space_usage") {
        return true;
      }
      return (
        mentions.findIndex(
          (candidate) =>
            candidate.status === "agent_restricted_by_space_usage" &&
            candidate.id === mention.id
        ) === index
      );
    })
    .map((mention, index) => {
      if (
        mention.status === "pending_conversation_access" ||
        mention.status === "pending_project_membership" ||
        mention.status === "agent_restricted_by_space_usage"
      ) {
        return (
          <MentionValidationRequired
            key={index}
            mention={mention}
            message={data}
            owner={owner}
            triggeringUser={triggeringUser}
            conversation={conversation}
          />
        );
      }
      if (mention.status === "user_restricted_by_conversation_access") {
        return (
          <MentionInvalid
            key={index}
            mention={mention}
            message={data}
            owner={owner}
            triggeringUser={triggeringUser}
            conversation={conversation}
          />
        );
      }
      return null;
    });
}

interface MessageItemProps {
  data: VirtuosoMessage;
  context: VirtuosoMessageListContext;
  nextData: VirtuosoMessage | null;
  prevData: VirtuosoMessage | null;
  onAgentMessageCompletionStatusClick?: (
    messageId: string,
    actionId?: string
  ) => void;
}

/**
 * @cc [owner:id13,label:react;concurrency] agent-message-stream-identity
 * AgentMessage MUST remount when its message ID changes on a rank-stable row so its stream state
 * belongs to the real message instead of an optimistic placeholder.
 */
export const MessageItem = React.forwardRef<HTMLDivElement, MessageItemProps>(
  function MessageItem(
    {
      data,
      context,
      prevData,
      nextData,
      onAgentMessageCompletionStatusClick,
    }: MessageItemProps,
    ref
  ) {
    const sId = data.sId;

    const citations = useMessageCitations(data);
    const { isSteeredAgentMessage, triggeringUser } = useMessageActors(data);

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

    const {
      areSameDate,
      isPreviousMessageSameSender,
      isPreviousAgentMessageSteered,
      topMargin,
    } = getMessageSpacing(data, prevData, isSteeredAgentMessage);

    if (isUserMessage(data) && data.context.origin === "wakeup") {
      return (
        <div
          ref={ref}
          className={cn(
            "mx-auto max-w-conversation",
            topMargin,
            !nextData && "mb-10"
          )}
        >
          <WakeUpMessage message={data} />
        </div>
      );
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

    if (isCompactionMessage(data)) {
      return (
        <div
          ref={ref}
          className={cn(
            "mx-auto max-w-conversation",
            topMargin,
            !nextData && "mb-10"
          )}
        >
          <CompactionMessage
            message={data}
            conversation={context.conversation}
          />
        </div>
      );
    }

    if (isConversationForkNotice(data)) {
      return (
        <>
          {!areSameDate && <MessageDateIndicator message={data} />}
          <div
            key={`message-id-${sId}`}
            ref={ref}
            className={cn(
              "mx-auto max-w-conversation",
              topMargin,
              !nextData && "mb-8"
            )}
          >
            <ConversationForkNotice message={data} owner={context.owner} />
          </div>
        </>
      );
    }

    return (
      <>
        {!areSameDate && <MessageDateIndicator message={data} />}
        <div
          key={`message-id-${sId}`}
          ref={ref}
          className={cn(
            "mx-auto max-w-conversation",
            topMargin,
            !nextData && "mb-10"
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
              disableReactions={
                context.agentBuilderContext?.disableReactions === true
              }
              isProjectArchived={context.isProjectArchived}
              setLimitReachedCode={context.setLimitReachedCode}
            />
          )}
          {isAgentMessageWithStreaming(data) && (
            <AgentMessage
              key={data.sId}
              user={context.user}
              triggeringUser={triggeringUser}
              conversationId={context.conversation.sId}
              spaceId={context.conversation.spaceId ?? null}
              uiView={context.uiView}
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
              isProjectArchived={context.isProjectArchived}
              setLimitReachedCode={context.setLimitReachedCode}
            />
          )}
          <MessageMentions
            data={data}
            owner={context.owner}
            conversation={context.conversation}
            triggeringUser={triggeringUser}
          />
        </div>
      </>
    );
  }
);
