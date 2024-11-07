import type { CitationType } from "@dust-tt/sparkle";
import { Citation, ZoomableImageCitationWrapper } from "@dust-tt/sparkle";
import type {
  ConversationMessageReactions,
  MessageWithContentFragmentsType,
  UserType,
  WorkspaceType,
} from "@dust-tt/types";
import { isSupportedImageContentType } from "@dust-tt/types";
import React from "react";
import { useSWRConfig } from "swr";

import { AgentMessage } from "@app/components/assistant/conversation/AgentMessage";
import { UserMessage } from "@app/components/assistant/conversation/UserMessage";
import { useSubmitFunction } from "@app/lib/client/utils";

interface MessageItemProps {
  conversationId: string;
  hideReactions: boolean;
  isInModal: boolean;
  isLastMessage: boolean;
  message: MessageWithContentFragmentsType;
  owner: WorkspaceType;
  reactions: ConversationMessageReactions;
  user: UserType;
}

const MessageItem = React.forwardRef<HTMLDivElement, MessageItemProps>(
  function MessageItem(
    {
      conversationId,
      hideReactions,
      isInModal,
      isLastMessage,
      message,
      owner,
      reactions,
      user,
    }: MessageItemProps,
    ref
  ) {
    const { sId, type } = message;

    const convoReactions = reactions.find((r) => r.messageId === sId);
    const messageReactions = convoReactions?.reactions || [];
    const { mutate } = useSWRConfig();
    const { submit: onSubmitEmoji, isSubmitting: isSubmittingEmoji } =
      useSubmitFunction(
        async ({
          emoji,
          isToRemove,
        }: {
          emoji: string;
          isToRemove: boolean;
        }) => {
          const res = await fetch(
            `/api/w/${owner.sId}/assistant/conversations/${conversationId}/messages/${message.sId}/reactions`,
            {
              method: isToRemove ? "DELETE" : "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                reaction: emoji,
              }),
            }
          );
          if (res.ok) {
            await mutate(
              `/api/w/${owner.sId}/assistant/conversations/${conversationId}/reactions`
            );
          }
        }
      );

    if (message.visibility === "deleted") {
      return null;
    }

    const messageEmoji = hideReactions
      ? undefined
      : {
          reactions: messageReactions.map((reaction) => ({
            emoji: reaction.emoji,
            hasReacted: reaction.users.some((u) => u.userId === user.id),
            count: reaction.users.length,
          })),
          onSubmitEmoji,
          isSubmittingEmoji,
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
              messageEmoji={messageEmoji}
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
