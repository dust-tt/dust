import React from "react";
import { useSWRConfig } from "swr";

import { AgentMessage } from "@app/components/assistant/conversation/AgentMessage";
import { AttachmentCitation } from "@app/components/assistant/conversation/attachment/AttachmentCitation";
import { contentFragmentToAttachmentCitation } from "@app/components/assistant/conversation/attachment/utils";
import type { FeedbackSelectorProps } from "@app/components/assistant/conversation/FeedbackSelector";
import { MessageDateIndicator } from "@app/components/assistant/conversation/MessageDateIndicator";
import type {
  VirtuosoMessage,
  VirtuosoMessageListContext,
} from "@app/components/assistant/conversation/types";
import {
  getMessageDate,
  getMessageSId,
  isHandoverUserMessage,
  isMessageTemporayState,
  isUserMessage,
} from "@app/components/assistant/conversation/types";
import { UserMessage } from "@app/components/assistant/conversation/UserMessage";
import { useSendNotification } from "@app/hooks/useNotification";
import { useSubmitFunction } from "@app/lib/client/utils";
import { classNames } from "@app/lib/utils";

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
    const sId = getMessageSId(data);

    const sendNotification = useSendNotification();

    const { mutate } = useSWRConfig();
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
          const res = await fetch(
            `/api/w/${context.owner.sId}/assistant/conversations/${context.conversationId}/messages/${sId}/feedbacks`,
            {
              method: shouldRemoveExistingFeedback ? "DELETE" : "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                thumbDirection: thumb,
                feedbackContent,
                isConversationShared,
              }),
            }
          );
          if (res.ok) {
            if (feedbackContent && !shouldRemoveExistingFeedback) {
              sendNotification({
                title: "Feedback submitted",
                description:
                  "Your comment has been submitted successfully to the Builder of this agent. Thank you!",
                type: "success",
              });
            }
            await mutate(
              `/api/w/${context.owner.sId}/assistant/conversations/${context.conversationId}/feedbacks`
            );
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
    };

    const citations =
      isUserMessage(data) && data.contentFragments.length > 0
        ? data.contentFragments.map((contentFragment) => {
            const attachmentCitation =
              contentFragmentToAttachmentCitation(contentFragment);

            return (
              <AttachmentCitation
                owner={context.owner}
                key={attachmentCitation.id}
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

    if (isHandoverUserMessage(data)) {
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
          className={classNames(
            "mx-auto min-w-60",
            "pt-6 md:pt-10",
            "max-w-3xl"
          )}
        >
          {isUserMessage(data) && (
            <UserMessage
              citations={citations}
              conversationId={context.conversationId}
              isLastMessage={!nextData}
              message={data}
              owner={context.owner}
            />
          )}
          {isMessageTemporayState(data) && (
            <AgentMessage
              user={context.user}
              conversationId={context.conversationId}
              isLastMessage={!nextData}
              messageStreamState={data}
              messageFeedback={messageFeedbackWithSubmit}
              owner={context.owner}
              hideRetryButton={hackyIsAgentHandingOver(data, nextData)}
            />
          )}
        </div>
      </>
    );
  }
);

/*
 * Hacky way to check if an agent message is performing a handover to another agent:
 * A handover agent message will be followed by a handover user message that points to this message.
 *
 * Since we don't have branching in the conversation, we don't want to retry a message that has generated another agent response.
 *
 * This is not very robust and should be removed once we have branching in the conversation.
 * (ex: if there's another agent message in between, this will return false and we will display the buttons of the agent message handing off).
 */
const hackyIsAgentHandingOver = (
  currentMessage: VirtuosoMessage | null,
  nextMessage: VirtuosoMessage | null
): boolean => {
  // Early return if current message is not an agent message.
  if (!currentMessage || !isMessageTemporayState(currentMessage)) {
    return false;
  }

  // Early return if next message is not a handover user message.
  if (!nextMessage || !isHandoverUserMessage(nextMessage)) {
    return false;
  }

  // Check if the current message is the same as the origin message of the handover user message.
  return currentMessage.message.sId === nextMessage.context.originMessageId;
};
