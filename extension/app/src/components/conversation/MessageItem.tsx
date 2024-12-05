import type {
  ConversationMessageReactionsType,
  LightWorkspaceType,
} from "@dust-tt/client";
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
import type { CitationType } from "@dust-tt/sparkle/dist/esm/components/Citation";
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
  reactions: ConversationMessageReactionsType;
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

    switch (type) {
      case "user_message":
        const citations = message.contenFragments
          ? message.contenFragments.map((contentFragment) => {
              const citationType: CitationType = [
                "dust-application/slack",
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
