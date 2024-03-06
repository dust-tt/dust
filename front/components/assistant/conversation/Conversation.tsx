import type { UserType, WorkspaceType } from "@dust-tt/types";
import type { AgentMention } from "@dust-tt/types";
import type { AgentGenerationCancelledEvent } from "@dust-tt/types";
import type {
  AgentMessageNewEvent,
  ConversationTitleEvent,
  UserMessageNewEvent,
} from "@dust-tt/types";
import { isAgentMention, isUserMessageType } from "@dust-tt/types";
import { useCallback, useEffect, useRef } from "react";

import { AgentMessage } from "@app/components/assistant/conversation/AgentMessage";
import { ContentFragment } from "@app/components/assistant/conversation/ContentFragment";
import { CONVERSATION_PARENT_SCROLL_DIV_ID } from "@app/components/assistant/conversation/lib";
import { UserMessage } from "@app/components/assistant/conversation/UserMessage";
import { useEventSource } from "@app/hooks/useEventSource";
import {
  useConversation,
  useConversationReactions,
  useConversations,
} from "@app/lib/swr";

/**
 *
 * @param isInModal is the conversation happening in a side modal, i.e. when testing an assistant?
 * @returns
 */
export default function Conversation({
  owner,
  user,
  conversationId,
  onStickyMentionsChange,
  isInModal,
  hideReactions,
}: {
  owner: WorkspaceType;
  user: UserType;
  conversationId: string;
  onStickyMentionsChange?: (mentions: AgentMention[]) => void;
  isInModal?: boolean;
  hideReactions?: boolean;
}) {
  const {
    conversation,
    isConversationError,
    isConversationLoading,
    mutateConversation,
  } = useConversation({
    conversationId,
    workspaceId: owner.sId,
  });

  const { mutateConversations } = useConversations({
    workspaceId: owner.sId,
  });

  const { reactions } = useConversationReactions({
    workspaceId: owner.sId,
    conversationId,
  });

  useEffect(() => {
    const mainTag = document.getElementById(
      CONVERSATION_PARENT_SCROLL_DIV_ID[isInModal ? "modal" : "page"]
    );
    if (mainTag) {
      mainTag.scrollTo(0, mainTag.scrollHeight);
    }
  }, [conversation?.content.length, isInModal]);

  useEffect(() => {
    if (!onStickyMentionsChange) {
      return;
    }
    const lastUserMessageContent = conversation?.content.findLast(
      (versionedMessages) =>
        versionedMessages.some(
          (message) =>
            isUserMessageType(message) &&
            message.visibility !== "deleted" &&
            message.user?.id === user.id
        )
    );

    if (!lastUserMessageContent) {
      return;
    }

    const lastUserMessage =
      lastUserMessageContent[lastUserMessageContent.length - 1];

    if (!lastUserMessage || !isUserMessageType(lastUserMessage)) {
      return;
    }

    const mentions = lastUserMessage.mentions;
    const agentMentions = mentions.filter(isAgentMention);
    onStickyMentionsChange(agentMentions);
  }, [
    conversation?.content,
    conversation?.content.length,
    onStickyMentionsChange,
    user.id,
  ]);

  const buildEventSourceURL = useCallback(
    (lastEvent: string | null) => {
      const esURL = `/api/w/${owner.sId}/assistant/conversations/${conversationId}/events`;
      let lastEventId = "";
      if (lastEvent) {
        const eventPayload: {
          eventId: string;
        } = JSON.parse(lastEvent);
        lastEventId = eventPayload.eventId;
      }
      const url = esURL + "?lastEventId=" + lastEventId;

      return url;
    },
    [conversationId, owner.sId]
  );

  const onEventCallback = useCallback(
    (eventStr: string) => {
      const eventPayload: {
        eventId: string;
        data:
          | UserMessageNewEvent
          | AgentMessageNewEvent
          | AgentGenerationCancelledEvent
          | ConversationTitleEvent;
      } = JSON.parse(eventStr);

      const event = eventPayload.data;

      if (!eventIds.current.includes(eventPayload.eventId)) {
        eventIds.current.push(eventPayload.eventId);
        switch (event.type) {
          case "user_message_new":
          case "agent_message_new":
          case "agent_generation_cancelled":
            const isMessageAlreadyInConversation = conversation?.content?.some(
              (contentBlock) =>
                contentBlock.some(
                  (message) =>
                    "sId" in message && message.sId === event.messageId
                )
            );
            if (!isMessageAlreadyInConversation) {
              void mutateConversation();
            }
            break;
          case "conversation_title": {
            void mutateConversation();
            void mutateConversations(); // to refresh the list of convos in the sidebar
            break;
          }
          default:
            ((t: never) => {
              console.error("Unknown event type", t);
            })(event);
        }
      }
    },
    [mutateConversation, mutateConversations, conversation]
  );

  useEventSource(buildEventSourceURL, onEventCallback, {
    // We only start consuming the stream when the conversation has been loaded.
    isReadyToConsumeStream: !isConversationLoading,
  });
  const eventIds = useRef<string[]>([]);

  if (isConversationLoading) {
    return null;
  } else if (isConversationError) {
    return <div>Error loading conversation</div>;
  }
  if (!conversation) {
    return <div>No conversation here</div>;
  }

  return (
    <div className="pb-44">
      {conversation.content.map((versionedMessages) => {
        const m = versionedMessages[versionedMessages.length - 1];
        const convoReactions = reactions.find((r) => r.messageId === m.sId);
        const messageReactions = convoReactions?.reactions || [];

        if (m.visibility === "deleted") {
          return null;
        }
        switch (m.type) {
          case "user_message":
            return (
              <div
                key={`message-id-${m.sId}`}
                className="bg-structure-50 px-2 py-8"
              >
                <div className="mx-auto flex max-w-4xl flex-col gap-4">
                  <UserMessage
                    message={m}
                    conversation={conversation}
                    owner={owner}
                    user={user}
                    reactions={messageReactions}
                    hideReactions={hideReactions}
                  />
                </div>
              </div>
            );
          case "agent_message":
            return (
              <div key={`message-id-${m.sId}`} className="px-2 py-8">
                <div className="mx-auto flex max-w-4xl gap-4">
                  <AgentMessage
                    message={m}
                    owner={owner}
                    user={user}
                    conversationId={conversationId}
                    reactions={messageReactions}
                    isInModal={isInModal}
                    hideReactions={hideReactions}
                  />
                </div>
              </div>
            );
          case "content_fragment":
            return (
              <div
                key={`message-id-${m.sId}`}
                className="items-center bg-structure-50  px-2 pt-8"
              >
                <div className="mx-auto flex max-w-4xl flex-col gap-4">
                  <ContentFragment message={m} />
                </div>
              </div>
            );
          default:
            ((message: never) => {
              console.error("Unknown message type", message);
            })(m);
        }
      })}
    </div>
  );
}
