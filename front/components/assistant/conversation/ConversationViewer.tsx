import { Spinner } from "@dust-tt/sparkle";
import type {
  AgentGenerationCancelledEvent,
  AgentMention,
  AgentMessageNewEvent,
  AgentMessageType,
  ContentFragmentType,
  ConversationTitleEvent,
  UserMessageNewEvent,
  UserMessageType,
  UserType,
  WorkspaceType,
} from "@dust-tt/types";
import { isContentFragmentType } from "@dust-tt/types";
import { isAgentMention, isUserMessageType } from "@dust-tt/types";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import React from "react";
import { useInView } from "react-intersection-observer";

import { CONVERSATION_PARENT_SCROLL_DIV_ID } from "@app/components/assistant/conversation/lib";
import MessageGroup from "@app/components/assistant/conversation/messages/MessageGroup";
import { useEventSource } from "@app/hooks/useEventSource";
import { useLastMessageGroupObserver } from "@app/hooks/useLastMessageGroupObserver";
import type { FetchConversationMessagesResponse } from "@app/lib/api/assistant/messages";
import {
  getUpdatedMessagesFromEvent,
  getUpdatedParticipantsFromEvent,
} from "@app/lib/client/conversation/event_handlers";
import {
  useConversation,
  useConversationMessages,
  useConversationParticipants,
  useConversationReactions,
  useConversations,
} from "@app/lib/swr/conversations";
import { classNames } from "@app/lib/utils";

const DEFAULT_PAGE_LIMIT = 50;

export type MessageWithContentFragmentsType =
  | AgentMessageType
  | (UserMessageType & {
      contenFragments?: ContentFragmentType[];
    });

interface ConversationViewerProps {
  conversationId: string;
  hideReactions?: boolean;
  isFading?: boolean;
  isInModal?: boolean;
  onStickyMentionsChange?: (mentions: AgentMention[]) => void;
  owner: WorkspaceType;
  user: UserType;
}

/**
 *
 * @param isInModal is the conversation happening in a side modal, i.e. when testing an assistant?
 * @returns
 */
const ConversationViewer = React.forwardRef<
  HTMLDivElement,
  ConversationViewerProps
>(function ConversationViewer(
  {
    owner,
    user,
    conversationId,
    onStickyMentionsChange,
    isInModal = false,
    hideReactions = false,
    isFading = false,
  },
  ref
) {
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

  const {
    isLoadingInitialData,
    isMessagesLoading,
    isValidating,
    messages,
    mutateMessages,
    setSize,
    size,
  } = useConversationMessages({
    conversationId,
    workspaceId: owner.sId,
    limit: DEFAULT_PAGE_LIMIT,
  });

  const { reactions } = useConversationReactions({
    workspaceId: owner.sId,
    conversationId,
  });

  const { mutateConversationParticipants } = useConversationParticipants({
    conversationId,
    workspaceId: owner.sId,
  });

  const { hasMore, latestPage, oldestPage } = useMemo(() => {
    return {
      hasMore: messages.at(0)?.hasMore,
      latestPage: messages.at(-1),
      oldestPage: messages.at(0),
    };
  }, [messages]);

  // Handle scroll to bottom on new message input.
  const latestMessageIdRef = useRef<string | null>(null);
  useEffect(() => {
    const lastestMessageId = latestPage?.messages.at(-1)?.sId;

    // If latest message Id has changed, scroll to bottom of conversation.
    if (lastestMessageId && latestMessageIdRef.current !== lastestMessageId) {
      const mainTag = document.getElementById(
        CONVERSATION_PARENT_SCROLL_DIV_ID[isInModal ? "modal" : "page"]
      );

      if (mainTag) {
        mainTag.scrollTo(0, mainTag.scrollHeight);
      }

      latestMessageIdRef.current = lastestMessageId;
    }
  }, [isInModal, latestPage]);

  // Keep a reference to the previous oldest message to maintain user position
  // after fetching more data. This is a best effort approach to keep the user
  // roughly at the same place they were before the new data is loaded.
  const [prevFirstMessageId, setPrevFirstMessageId] = useState<string | null>(
    null
  );
  const prevFirstMessageRef = useRef<HTMLDivElement>(null);

  // Instantly scroll user back to previous position after new data is loaded.
  // Note: scrolling is from the bottom of the screen.
  useEffect(() => {
    if (
      prevFirstMessageId &&
      prevFirstMessageRef.current &&
      !isMessagesLoading &&
      !isValidating
    ) {
      prevFirstMessageRef.current.scrollIntoView({
        behavior: "instant",
        block: "start",
      });

      setPrevFirstMessageId(null);
    }
  }, [
    prevFirstMessageId,
    prevFirstMessageRef,
    isMessagesLoading,
    isValidating,
  ]);

  const lastUserMessage = useMemo(() => {
    return latestPage?.messages.findLast(
      (message) =>
        isUserMessageType(message) &&
        message.visibility !== "deleted" &&
        message.user?.id === user.id
    );
  }, [latestPage, user.id]);

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

  const { ref: viewRef, inView: isTopOfListVisible } = useInView();

  // On page load or when new data is loaded, check if the top of the list
  // is visible and there is more data to load. If so, set the current
  // highest message ID and increment the page number to load more data.
  useEffect(() => {
    const isLoadingData =
      isLoadingInitialData ||
      isMessagesLoading ||
      isValidating ||
      prevFirstMessageId;

    if (!isLoadingData && isTopOfListVisible && hasMore) {
      // Set the current highest message Id.
      setPrevFirstMessageId(
        oldestPage ? oldestPage?.messages[0]?.sId ?? null : null
      );

      // Increment the page number to load more data.
      void setSize(size + 1);
    }
  }, [
    isLoadingInitialData,
    isMessagesLoading,
    isValidating,
    prevFirstMessageId,
    isTopOfListVisible,
    hasMore,
    oldestPage,
    size,
    setPrevFirstMessageId,
    setSize,
  ]);

  // Hooks related to message streaming.

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
            // Temporarily add agent message using event payload until revalidation.
            void mutateMessages(async (currentMessagePages) => {
              return getUpdatedMessagesFromEvent(currentMessagePages, event);
            });

            void mutateConversationParticipants(async (participants) => {
              return getUpdatedParticipantsFromEvent(participants, event);
            });
            break;

          case "agent_generation_cancelled":
            void mutateMessages();
            break;

          case "conversation_title": {
            console.log("Conversation title event", event);
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
    [
      mutateConversation,
      mutateConversations,
      mutateMessages,
      mutateConversationParticipants,
    ]
  );

  useEventSource(
    buildEventSourceURL,
    onEventCallback,
    `conversation-${conversationId}`,
    {
      // We only start consuming the stream when the conversation has been loaded and we have a first page of message.
      isReadyToConsumeStream:
        !isConversationLoading &&
        !isLoadingInitialData &&
        messages.length !== 0,
    }
  );
  const eventIds = useRef<string[]>([]);

  const typedGroupedMessages = useMemo(
    () => groupMessagesByType(messages),
    [messages]
  );

  useLastMessageGroupObserver(typedGroupedMessages);

  return (
    <div
      className={classNames(
        "flex w-full max-w-4xl flex-1 flex-col justify-start gap-2 pb-4",
        isFading ? "animate-fadeout" : "",
        isInModal ? "pt-4" : "sm:px-4"
      )}
      ref={ref}
    >
      {isConversationError && (
        <div className="flex flex-1" ref={ref}>
          Error loading conversation
        </div>
      )}
      {/* Invisible span to detect when the user has scrolled to the top of the list. */}
      {hasMore && !isMessagesLoading && !prevFirstMessageId && (
        <span ref={viewRef} className="py-4" />
      )}
      {(isMessagesLoading || prevFirstMessageId) && (
        <div className="flex justify-center py-4">
          <Spinner variant="color" size="xs" />
        </div>
      )}
      {conversation &&
        typedGroupedMessages.map((typedGroup, index) => {
          const isLastGroup = index === typedGroupedMessages.length - 1;
          return (
            <MessageGroup
              key={`typed-group-${index}`}
              messages={typedGroup}
              isLastMessageGroup={isLastGroup}
              conversationId={conversationId}
              hideReactions={hideReactions}
              isInModal={isInModal}
              owner={owner}
              reactions={reactions}
              prevFirstMessageId={prevFirstMessageId}
              prevFirstMessageRef={prevFirstMessageRef}
              user={user}
              latestPage={latestPage}
            />
          );
        })}
    </div>
  );
});

export default ConversationViewer;

/**
 * Groups and organizes messages by their type, associating content_fragments
 * with the following user_message.
 *
 * This function processes an array of messages, collecting content_fragments
 * and attaching them to subsequent user_messages, then groups these messages
 * with the previous user_message, ensuring consecutive messages are grouped
 * together.
 *
 * Example:
 * Input [[content_fragment, content_fragment], [user_message], [agent_message, agent_message]]
 * Output: [[user_message with content_fragment[]], [agent_message, agent_message]]
 * This structure enables layout customization for consecutive messages of the same type
 * and displays content_fragments within user_messages.
 */
const groupMessagesByType = (
  messages: FetchConversationMessagesResponse[]
): MessageWithContentFragmentsType[][][] => {
  const groupedMessages: MessageWithContentFragmentsType[][][] = [];
  let tempContentFragments: ContentFragmentType[] = [];

  messages
    .flatMap((page) => page.messages)
    .forEach((message) => {
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
          groupedMessages.push([[messageWithContentFragments]]);
        } else {
          messageWithContentFragments = message;

          const lastGroup = groupedMessages[groupedMessages.length - 1];

          if (!lastGroup) {
            groupedMessages.push([[messageWithContentFragments]]);
          } else {
            const [lastMessageGroup] = lastGroup;
            lastMessageGroup.push(messageWithContentFragments); // Add agent messages to the last group.
          }
        }
      }
    });
  return groupedMessages;
};
