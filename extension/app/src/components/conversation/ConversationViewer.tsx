import type {
  AgentGenerationCancelledEvent,
  AgentMention,
  AgentMessageNewEvent,
  AgentMessageType,
  ContentFragmentType,
  ConversationTitleEvent,
  LightWorkspaceType,
  MessageWithContentFragmentsType,
  UserMessageNewEvent,
  UserMessageType,
} from "@dust-tt/types";
import {
  isAgentMention,
  isContentFragmentType,
  isUserMessageType,
} from "@dust-tt/types";
import MessageGroup from "@extension/components/conversation/MessageGroup";
import { usePublicConversation } from "@extension/components/conversation/usePublicConversation";
import { useEventSource } from "@extension/hooks/useEventSource";
import type { StoredUser } from "@extension/lib/storage";
import { classNames } from "@extension/lib/utils";
import { useCallback, useEffect, useMemo, useRef } from "react";

interface ConversationViewerProps {
  conversationId: string;
  onStickyMentionsChange?: (mentions: AgentMention[]) => void;
  owner: LightWorkspaceType;
  user: StoredUser;
}

export function ConversationViewer({
  conversationId,
  onStickyMentionsChange,
  owner,
  user,
}: ConversationViewerProps) {
  const { conversation, isConversationLoading, mutateConversation } =
    usePublicConversation({
      conversationId,
      workspaceId: owner.sId,
    });

  // We only keep the last version of each message.
  const messages = (conversation?.content || []).map(
    (messages) => messages[messages.length - 1]
  );

  const lastUserMessage = useMemo(() => {
    return messages.findLast(
      (message) =>
        isUserMessageType(message) &&
        message.visibility !== "deleted" &&
        message.user?.sId === user.userId
    );
  }, [messages, user.userId]);

  const agentMentions = useMemo(() => {
    if (!lastUserMessage || !isUserMessageType(lastUserMessage)) {
      return [];
    }
    return lastUserMessage.mentions.filter(isAgentMention);
  }, [lastUserMessage]);

  // Handle sticky mentions changes.
  useEffect(() => {
    if (!onStickyMentionsChange) {
      return;
    }

    if (agentMentions.length > 0) {
      onStickyMentionsChange(agentMentions);
    }
  }, [agentMentions, onStickyMentionsChange]);

  // Hooks related to message streaming.

  const buildEventSourceURL = useCallback(
    (lastEvent: string | null) => {
      const esURL = `${process.env.DUST_DOMAIN}/api/v1/w/${owner.sId}/assistant/conversations/${conversationId}/events`;
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
        console.log("Received event", event);
        eventIds.current.push(eventPayload.eventId);
        switch (event.type) {
          case "user_message_new":
          case "agent_message_new":
          case "agent_generation_cancelled":
          case "conversation_title": {
            void mutateConversation();
            break;
          }
          default:
            ((t: never) => {
              console.error("Unknown event type", t);
            })(event);
        }
      }
    },
    [mutateConversation]
  );

  useEventSource(
    buildEventSourceURL,
    onEventCallback,
    `conversation-${conversationId}`,
    {
      // We only start consuming the stream when the conversation has been loaded and we have a first page of message.
      isReadyToConsumeStream: !isConversationLoading && messages.length !== 0,
    }
  );
  const eventIds = useRef<string[]>([]);

  const typedGroupedMessages = useMemo(
    () => (messages ? groupMessagesByType(messages) : []),
    [messages]
  );

  return (
    <div
      className={classNames(
        "flex w-full max-w-4xl flex-1 flex-col justify-start gap-2 pb-4"
      )}
    >
      {/* Invisible span to detect when the user has scrolled to the top of the list. */}
      {conversation &&
        typedGroupedMessages.map((typedGroup, index) => {
          const isLastGroup = index === typedGroupedMessages.length - 1;
          return (
            <MessageGroup
              key={`typed-group-${index}`}
              messages={typedGroup}
              isLastMessageGroup={isLastGroup}
              conversationId={conversationId}
              hideReactions={true}
              isInModal={false}
              owner={owner}
              reactions={[]}
              user={user}
            />
          );
        })}
    </div>
  );
}

/**
 * This function processes an array of messages, collecting content_fragments
 * and attaching them to subsequent user_messages, then groups the agent messages
 * with the previous user_message, ensuring question/answers are grouped
 * together :
 *
 * - user message + potential content fragments posted with the user message
 * - one or multiple agent messages depending on the number of mentions in the user message.
 *
 * That means we want this:
 * Input [content_fragment, content_fragment, user_message, agent_message, agent_message, user_message, agent_message]
 * Output [[user_message with content_fragment[], agent_message, agent_message], [user_message, agent_message ]]
 * This structure enables layout customization for groups of question/answers
 * and displays content_fragments within user_messages.
 */
const groupMessagesByType = (
  messages: (ContentFragmentType | UserMessageType | AgentMessageType)[]
): MessageWithContentFragmentsType[][] => {
  const groupedMessages: MessageWithContentFragmentsType[][] = [];
  let tempContentFragments: ContentFragmentType[] = [];

  messages.forEach((message) => {
    if (isContentFragmentType(message)) {
      tempContentFragments.push(message); // Collect content fragments.
    } else {
      let messageWithContentFragments: MessageWithContentFragmentsType;
      if (isUserMessageType(message)) {
        // Attach collected content fragments to the user message.
        messageWithContentFragments = {
          ...message,
          contenFragments: tempContentFragments,
        };
        tempContentFragments = []; // Reset the collected content fragments.

        // Start a new group for user messages.
        groupedMessages.push([messageWithContentFragments]);
      } else {
        messageWithContentFragments = message;

        const lastGroup = groupedMessages[groupedMessages.length - 1];

        if (!lastGroup) {
          groupedMessages.push([messageWithContentFragments]);
        } else {
          lastGroup.push(messageWithContentFragments); // Add agent messages to the last group.
        }
      }
    }
  });
  return groupedMessages;
};
