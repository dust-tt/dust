import type { CitationType, FeedbackSelectorProps } from "@dust-tt/sparkle";
import {
  Avatar,
  CitationNew,
  CitationNewIcons,
  CitationNewImage,
  CitationNewTitle,
  DocumentTextIcon,
  Icon,
  SlackLogo,
} from "@dust-tt/sparkle";
import { useSendNotification } from "@dust-tt/sparkle";
import type {
  MessageWithContentFragmentsType,
  UserType,
  WorkspaceType,
} from "@dust-tt/types";
import { useRouter } from "next/router";
import React, { useEffect, useState } from "react";
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
  message: MessageWithContentFragmentsType;
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

    const messageFeedbackWithSubmit: FeedbackSelectorProps = {
      feedback: messageFeedback
        ? {
            thumb: messageFeedback.thumbDirection,
            feedbackContent: messageFeedback.content,
          }
        : null,
      onSubmitThumb,
      isSubmittingThumb,
    };

    const router = useRouter();
    const [hasScrolledToMessage, setHasScrolledToMessage] = useState(false);
    const [highlighted, setHighlighted] = useState(false);

    // Effect: scroll to the message and temporarily highlight if it is the anchor's target
    useEffect(() => {
      if (!router.asPath.includes("#")) {
        return;
      }
      const messageIdToScrollTo = router.asPath.split("#")[1];
      if (messageIdToScrollTo === sId && !hasScrolledToMessage) {
        setTimeout(() => {
          setHasScrolledToMessage(true);
          document
            .getElementById(`message-id-${sId}`)
            ?.scrollIntoView({ behavior: "smooth", block: "center" });
          setHighlighted(true);

          // Highlight the message for a short time
          setTimeout(() => {
            setHighlighted(false);
          }, 2000);
        }, 100);
      }
    }, [hasScrolledToMessage, router.asPath, sId, ref]);

    if (message.visibility === "deleted") {
      return null;
    }

    switch (type) {
      case "user_message":
        const citations = message.contenFragments
          ? message.contenFragments.map((contentFragment) => {
              const citationType: CitationType = [
                "dust-application/slack",
                "text/vnd.dust.attachment.slack.thread",
              ].includes(contentFragment.contentType)
                ? "slack"
                : "document";

              const icon =
                citationType === "slack" ? SlackLogo : DocumentTextIcon;

              return (
                <CitationNew
                  key={contentFragment.sId}
                  href={contentFragment.sourceUrl ?? undefined}
                >
                  <div className="flex gap-2">
                    {contentFragment.context.profilePictureUrl && (
                      <CitationNewIcons>
                        <Avatar
                          visual={contentFragment.context.profilePictureUrl}
                          size="xs"
                        />
                      </CitationNewIcons>
                    )}
                    {contentFragment.sourceUrl ? (
                      <>
                        <CitationNewImage imgSrc={contentFragment.sourceUrl} />
                        <CitationNewIcons>
                          <Icon visual={icon} />
                        </CitationNewIcons>
                      </>
                    ) : (
                      <CitationNewIcons>
                        <Icon visual={icon} />
                      </CitationNewIcons>
                    )}
                  </div>
                  <CitationNewTitle>{contentFragment.title}</CitationNewTitle>
                </CitationNew>
              );
            })
          : undefined;

        return (
          <div
            key={`message-id-${sId}`}
            id={`message-id-${sId}`}
            ref={ref}
            className={highlighted ? "bg-blue-100" : ""}
          >
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
          <div
            key={`message-id-${sId}`}
            id={`message-id-${sId}`}
            ref={ref}
            className={highlighted ? "bg-blue-100" : ""}
          >
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
