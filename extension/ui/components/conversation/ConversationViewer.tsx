import type { MessageWithContentFragmentsType } from "@app/shared/lib/conversation";
import { getUpdatedMessagesFromEvent } from "@app/shared/lib/conversation";
import { classNames } from "@app/shared/lib/utils";
import type { StoredUser } from "@app/shared/services/auth";
import MessageGroup from "@app/ui/components/conversation/MessageGroup";
import { useConversationFeedbacks } from "@app/ui/components/conversation/useConversationFeedbacks";
import { usePublicConversation } from "@app/ui/components/conversation/usePublicConversation";
import { useEventSource } from "@app/ui/hooks/useEventSource";
import type {
  AgentGenerationCancelledEvent,
  AgentMentionType,
  AgentMessageNewEvent,
  AgentMessagePublicType,
  ContentFragmentType,
  ConversationTitleEvent,
  LightWorkspaceType,
  UserMessageNewEvent,
  UserMessageType,
} from "@dust-tt/client";
import { isAgentMention } from "@dust-tt/client";
import { useCallback, useEffect, useMemo, useRef } from "react";

interface ConversationViewerProps {
  conversationId: string;
  onStickyMentionsChange?: (mentions: AgentMentionType[]) => void;
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
    });

  // We only keep the last version of each message.
  const messages = (conversation?.content || []).map(
    (messages) => messages[messages.length - 1]
  );

  const lastUserMessage = useMemo(() => {
    return messages.findLast(
      (message) =>
        message.type === "user_message" &&
        message.visibility !== "deleted" &&
        message.user?.sId === user.sId
    );
  }, [messages, user.sId]);

  const agentMentions = useMemo(() => {
    if (!lastUserMessage || lastUserMessage.type !== "user_message") {
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

  const { feedbacks } = useConversationFeedbacks({ conversationId });

  // Hooks related to message streaming.

  const buildEventSourceURL = useCallback(
    (lastEvent: string | null) => {
      const esURL = `${user.dustDomain}/api/v1/w/${owner.sId}/assistant/conversations/${conversationId}/events`;
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
            void mutateConversation(async (currentMessagePages) => {
              return getUpdatedMessagesFromEvent(currentMessagePages, event);
            });
            break;

          case "agent_generation_cancelled":
          case "conversation_title":
            void mutateConversation();
            break;
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
        "flex w-full flex-1 flex-grow flex-col justify-start gap-2 pb-4"
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
              feedbacks={feedbacks}
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
  messages: (ContentFragmentType | UserMessageType | AgentMessagePublicType)[]
): MessageWithContentFragmentsType[][] => {
  const groupedMessages: MessageWithContentFragmentsType[][] = [];
  let tempContentFragments: ContentFragmentType[] = [];

  messages.forEach((message) => {
    if (message.type === "content_fragment") {
      tempContentFragments.push(message); // Collect content fragments.
    } else {
      let messageWithContentFragments: MessageWithContentFragmentsType;
      if (message.type === "user_message") {
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
