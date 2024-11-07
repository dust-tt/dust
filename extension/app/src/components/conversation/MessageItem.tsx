import { Citation, ZoomableImageCitationWrapper } from "@dust-tt/sparkle";
import type { CitationType } from "@dust-tt/sparkle/dist/esm/components/Citation";
import type {
  ConversationMessageReactions,
  LightWorkspaceType,
} from "@dust-tt/types";
import { isSupportedImageContentType } from "@dust-tt/types";
import { AgentMessage } from "@extension/components/conversation/AgentMessage";
import { UserMessage } from "@extension/components/conversation/UserMessage";
import type { MessageWithContentFragmentsType } from "@extension/lib/conversation";
import type { StoredUser } from "@extension/lib/storage";
import React from "react";

interface MessageItemProps {
  conversationId: string;
  hideReactions: boolean;
  isInModal: boolean;
  isLastMessage: boolean;
  message: MessageWithContentFragmentsType;
  owner: LightWorkspaceType;
  reactions: ConversationMessageReactions;
  user: StoredUser;
}

const MessageItem = React.forwardRef<HTMLDivElement, MessageItemProps>(
  function MessageItem(
    { conversationId, isLastMessage, message, owner }: MessageItemProps,
    ref
  ) {
    const { sId, type } = message;

    if (message.visibility === "deleted") {
      return null;
    }

    const messageEmoji = undefined;

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
              size="compact"
            />
          </div>
        );

      case "agent_message":
        return (
          <div key={`message-id-${sId}`} ref={ref}>
            <AgentMessage
              conversationId={conversationId}
              isLastMessage={isLastMessage}
              message={message}
              messageEmoji={messageEmoji}
              owner={owner}
              size="compact"
            />
          </div>
        );

      default:
        console.error("Unknown message type", message);
    }
  }
);

export default MessageItem;
