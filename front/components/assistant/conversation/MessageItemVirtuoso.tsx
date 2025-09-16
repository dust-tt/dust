import React from "react";
import { useSWRConfig } from "swr";

import { AgentMessageVirtuoso } from "@app/components/assistant/conversation/AgentMessageVirtuoso";
import {
  AttachmentCitation,
  contentFragmentToAttachmentCitation,
} from "@app/components/assistant/conversation/AttachmentCitation";
import type { FeedbackSelectorProps } from "@app/components/assistant/conversation/FeedbackSelector";
import { UserMessage } from "@app/components/assistant/conversation/UserMessage";
import { useSendNotification } from "@app/hooks/useNotification";
import type { AgentMessageFeedbackType } from "@app/lib/api/assistant/feedback";
import { useSubmitFunction } from "@app/lib/client/utils";
import { classNames } from "@app/lib/utils";
import type {
  MessageWithContentFragmentsType,
  UserType,
  WorkspaceType,
} from "@app/types";

interface MessageItemProps {
  index: number;
  conversationId: string;
  messageFeedback: AgentMessageFeedbackType | undefined;
  isInModal: boolean;
  isLastMessage: boolean;
  message: MessageWithContentFragmentsType;
  owner: WorkspaceType;
  user: UserType;
}

const MessageItemVirtuoso = React.forwardRef<HTMLDivElement, MessageItemProps>(
  function MessageItem(
    {
      index,
      conversationId,
      messageFeedback,
      isInModal,
      isLastMessage,
      message,
      owner,
      user,
    }: MessageItemProps,
    ref
  ) {
    const { sId, type } = message;
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
            `/api/w/${owner.sId}/assistant/conversations/${conversationId}/messages/${message.sId}/feedbacks`,
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
              `/api/w/${owner.sId}/assistant/conversations/${conversationId}/feedbacks`
            );
          }
        }
      );

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

    switch (type) {
      case "user_message":
        const citations = message.contentFragments
          ? message.contentFragments.map((contentFragment) => {
              const attachmentCitation =
                contentFragmentToAttachmentCitation(contentFragment);

              return (
                <AttachmentCitation
                  key={attachmentCitation.id}
                  attachmentCitation={attachmentCitation}
                />
              );
            })
          : undefined;

        return (
          <div
            key={`message-id-${sId}`}
            ref={ref}
            className={classNames(
              "mx-auto min-w-60",
              index !== 0 && "mt-6 md:mt-10",
              isInModal ? "max-w-full" : "max-w-3xl"
            )}
          >
            <UserMessage
              citations={citations}
              conversationId={conversationId}
              isLastMessage={isLastMessage}
              message={message}
              owner={owner}
            />
          </div>
        );

      case "agent_message":
        return (
          <div
            key={`message-id-${sId}`}
            ref={ref}
            className={classNames(
              "mx-auto min-w-60",
              "mt-6 md:mt-10",
              isInModal ? "max-w-full" : "max-w-3xl"
            )}
          >
            <AgentMessageVirtuoso
              conversationId={conversationId}
              isLastMessage={isLastMessage}
              message={message}
              messageFeedback={messageFeedbackWithSubmit}
              owner={owner}
              user={user}
            />
          </div>
        );

      default:
        console.error("Unknown message type", message);
    }
  }
);

export default MessageItemVirtuoso;
