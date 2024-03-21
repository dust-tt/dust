// TODO(2024-03-21 flav) Replace by Spinner2 when available.
import { Spinner } from "@dust-tt/sparkle";
import type { UserType, WorkspaceType } from "@dust-tt/types";
import type { AgentMention } from "@dust-tt/types";
import type { AgentGenerationCancelledEvent } from "@dust-tt/types";
import type {
  AgentMessageNewEvent,
  ConversationTitleEvent,
  UserMessageNewEvent,
} from "@dust-tt/types";
import { isAgentMention, isUserMessageType } from "@dust-tt/types";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useInView } from "react-intersection-observer";

import { CONVERSATION_PARENT_SCROLL_DIV_ID } from "@app/components/assistant/conversation/lib";
import MessageItem from "@app/components/assistant/conversation/MessageItem";
import { useEventSource } from "@app/hooks/useEventSource";
import {
  useConversation,
  useConversationMessages,
  useConversationReactions,
  useConversations,
} from "@app/lib/swr";
import { classNames } from "@app/lib/utils";

const DEFAULT_PAGE_LIMIT = 50;

interface ConversationViewerProps {
  conversationId: string;
  hideReactions?: boolean;
  isFading?: boolean;
  isInModal?: boolean;
  // Use a key to trigger a re-render whenever the conversation changes.
  key: string;
  onStickyMentionsChange?: (mentions: AgentMention[]) => void;
  owner: WorkspaceType;
  user: UserType;
}

/**
 *
 * @param isInModal is the conversation happening in a side modal, i.e. when testing an assistant?
 * @returns
 */
export default function ConversationViewer({
  owner,
  user,
  conversationId,
  onStickyMentionsChange,
  isInModal = false,
  hideReactions = false,
  isFading = false,
}: ConversationViewerProps) {
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

  // Handle sticky mentions changes.
  useEffect(() => {
    if (!onStickyMentionsChange) {
      return;
    }

    const lastUserMessage = latestPage?.messages.findLast(
      (message) =>
        isUserMessageType(message) &&
        message.visibility !== "deleted" &&
        message.user?.id === user.id
    );

    if (!lastUserMessage || !isUserMessageType(lastUserMessage)) {
      return;
    }

    const { mentions } = lastUserMessage;
    const agentMentions = mentions.filter(isAgentMention);
    onStickyMentionsChange(agentMentions);
  }, [latestPage, onStickyMentionsChange, user.id]);

  const { ref, inView: isTopOfListVisible } = useInView();

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
          case "agent_generation_cancelled":
            const isMessageAlreadyInConversation = messages?.some(
              (messages) => {
                return messages.messages.some(
                  (message) =>
                    "sId" in message && message.sId === event.messageId
                );
              }
            );

            if (!isMessageAlreadyInConversation) {
              void mutateMessages();
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
    [mutateConversation, mutateConversations, messages, mutateMessages]
  );

  useEventSource(buildEventSourceURL, onEventCallback, {
    // We only start consuming the stream when the conversation has been loaded and we have a first page of message.
    isReadyToConsumeStream:
      !isConversationLoading && !isLoadingInitialData && messages.length !== 0,
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
    <div className={classNames("pb-44", isFading ? "animate-fadeout" : "")}>
      {/* Invisible span to detect when the user has scrolled to the top of the list. */}
      {hasMore && !isMessagesLoading && !prevFirstMessageId && (
        <span ref={ref} className="py-4" />
      )}
      {(isMessagesLoading || prevFirstMessageId) && (
        <div className="flex justify-center py-4">
          <Spinner size="xs" />
        </div>
      )}
      {messages.map((page) => {
        return page.messages.map((message) => {
          return (
            <MessageItem
              key={message.sId}
              conversation={conversation}
              hideReactions={hideReactions}
              isInModal={isInModal}
              message={message}
              owner={owner}
              reactions={reactions}
              ref={
                message.sId === prevFirstMessageId
                  ? prevFirstMessageRef
                  : undefined
              }
              user={user}
            />
          );
        });
      })}
    </div>
  );
}
