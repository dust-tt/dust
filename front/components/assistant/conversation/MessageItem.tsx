import type { FeedbackSelectorProps } from "@dust-tt/sparkle";
import {
  Avatar,
  Citation,
  CitationIcons,
  CitationImage,
  CitationTitle,
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
            isConversationShared: messageFeedback.isConversationShared,
          }
        : null,
      onSubmitThumb,
      isSubmittingThumb,
    };

    const [urlAnchor, setUrlAnchor] = useState<string | null>(null);
    const [hasScrolledToMessage, setHasScrolledToMessage] = useState(false);
    const [messageBlinking, setMessageBlinking] = useState(false);
    // Because the prop ref can be undefined
    const scrollRef = React.useRef<HTMLDivElement>(null);

    // Effect: set the url anchor
    useEffect(() => {
      if (typeof window !== "undefined") {
        const hashId = window.location.hash.replace("#", "");
        setUrlAnchor(hashId);
      }
    }, [sId]);

    // Effect: scroll to the message and temporarily highlight if it is the anchor's target
    useEffect(() => {
      if (!urlAnchor) {
        return;
      }
      if (urlAnchor === sId && !hasScrolledToMessage && (ref || scrollRef)) {
        setTimeout(() => {
          setHasScrolledToMessage(true);
          // Use ref to scroll to the message
          const divRef = ref
            ? (ref as React.RefObject<HTMLDivElement>)
            : scrollRef;
          if (divRef.current) {
            divRef.current.scrollIntoView({
              behavior: "instant",
              block: "center",
            });
          }
          setMessageBlinking(true);

          // Have the message blink for a short time
          setTimeout(() => {
            setMessageBlinking(false);
          }, 1000);
        }, 100);
      }
    }, [hasScrolledToMessage, urlAnchor, sId, ref, scrollRef]);

    if (message.visibility === "deleted") {
      return null;
    }

    switch (type) {
      case "user_message":
        const citations = message.contenFragments
          ? message.contenFragments.map((contentFragment) => {
              const citationType = [
                "dust-application/slack",
                "text/vnd.dust.attachment.slack.thread",
              ].includes(contentFragment.contentType)
                ? "slack"
                : "document";

              const icon =
                citationType === "slack" ? SlackLogo : DocumentTextIcon;

              return (
                <Citation
                  key={contentFragment.sId}
                  href={contentFragment.sourceUrl ?? undefined}
                >
                  <div className="flex gap-2">
                    {contentFragment.context.profilePictureUrl && (
                      <CitationIcons>
                        <Avatar
                          visual={contentFragment.context.profilePictureUrl}
                          size="xs"
                        />
                      </CitationIcons>
                    )}
                    {contentFragment.sourceUrl ? (
                      <>
                        <CitationImage imgSrc={contentFragment.sourceUrl} />
                        <CitationIcons>
                          <Icon visual={icon} />
                        </CitationIcons>
                      </>
                    ) : (
                      <CitationIcons>
                        <Icon visual={icon} />
                      </CitationIcons>
                    )}
                  </div>
                  <CitationTitle>{contentFragment.title}</CitationTitle>
                </Citation>
              );
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
          <div
            id={`message-id-${sId}`}
            ref={ref ?? scrollRef}
            className={messageBlinking ? "animate-[bgblink_200ms_3]" : ""}
          >
            <AgentMessage
              conversationId={conversationId}
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
