import type {
  CitationType,
  ConversationMessageFeedbackSelectorProps,
} from "@dust-tt/sparkle";
import { Citation, ZoomableImageCitationWrapper } from "@dust-tt/sparkle";
import { useSendNotification } from "@dust-tt/sparkle";
import type {
  MessageWithContentFragmentsType,
  UserType,
  WithRank,
  WorkspaceType,
} from "@dust-tt/types";
import { isSupportedImageContentType } from "@dust-tt/types";
import React from "react";
import { useSWRConfig } from "swr";

import { AgentMessage } from "@app/components/assistant/conversation/AgentMessage";
import { UserMessage } from "@app/components/assistant/conversation/UserMessage";
import type { AgentMessageFeedbackType } from "@app/lib/api/assistant/feedback";
import { useSubmitFunction } from "@app/lib/client/utils";

interface MessageItemProps {
  conversationId: string;
  messageFeedback: AgentMessageFeedbackType | undefined;
  isInModal: boolean;
  isLastMessage: boolean;
  message: WithRank<MessageWithContentFragmentsType>;
  owner: WorkspaceType;
  user: UserType;
}

const MessageItem = React.forwardRef<HTMLDivElement, MessageItemProps>(
  function MessageItem(
    {
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
          isToRemove,
          feedbackContent,
        }: {
          thumb: string;
          isToRemove: boolean;
          feedbackContent?: string | null;
        }) => {
          const res = await fetch(
            `/api/w/${owner.sId}/assistant/conversations/${conversationId}/messages/${message.sId}/feedbacks`,
            {
              method: isToRemove ? "DELETE" : "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                thumbDirection: thumb,
                feedbackContent,
              }),
            }
          );
          if (res.ok) {
            if (feedbackContent && !isToRemove) {
              sendNotification({
                title: "Feedback submitted",
                description:
                  "Your comment has been submitted successfully to the Builder of this assistant. Thank you!",
                type: "success",
              });
            }
            await mutate(
              `/api/w/${owner.sId}/assistant/conversations/${conversationId}/feedbacks`
            );
          }
        }
      );

    if (message.visibility === "deleted") {
      return null;
    }

    const messageFeedbackWithSubmit: ConversationMessageFeedbackSelectorProps =
      {
        feedback: messageFeedback
          ? {
              thumb: messageFeedback.thumbDirection,
              feedbackContent: messageFeedback.content,
            }
          : null,
        onSubmitThumb,
        isSubmittingThumb,
      };

    switch (type) {
      case "user_message":
        const citations = message.contenFragments
          ? message.contenFragments.map((contentFragment) => {
              const isZoomable = isSupportedImageContentType(
                contentFragment.contentType
              );
              const citationType: CitationType = [
                "dust-application/slack",
              ].includes(contentFragment.contentType)
                ? "slack"
                : "document";

              if (isZoomable) {
                return (
                  <ZoomableImageCitationWrapper
                    key={contentFragment.sId}
                    size="xs"
                    title={contentFragment.title}
                    imgSrc={`${contentFragment.sourceUrl}?action=view`}
                    alt={contentFragment.title}
                  />
                );
              } else {
                return (
                  <Citation
                    key={contentFragment.sId}
                    title={contentFragment.title}
                    sizing="fluid"
                    size="xs"
                    type={citationType}
                    href={contentFragment.sourceUrl || undefined}
                    imgSrc={contentFragment.sourceUrl || undefined}
                    avatarSrc={
                      contentFragment.context.profilePictureUrl || undefined
                    }
                  />
                );
              }
            })
          : undefined;

        return (
          <div key={`message-id-${sId}`} ref={ref}>
            <UserMessage
              citations={citations}
              conversationId={conversationId}
              isLastMessage={isLastMessage}
              message={message}
              owner={owner}
              size={isInModal ? "compact" : "normal"}
            />
          </div>
        );

      case "agent_message":
        return (
          <div key={`message-id-${sId}`} ref={ref}>
            <AgentMessage
              conversationId={conversationId}
              isInModal={isInModal}
              isLastMessage={isLastMessage}
              message={message}
              messageFeedback={messageFeedbackWithSubmit}
              owner={owner}
              user={user}
              size={isInModal ? "compact" : "normal"}
            />
          </div>
        );

      default:
        console.error("Unknown message type", message);
    }
  }
);

export default MessageItem;
