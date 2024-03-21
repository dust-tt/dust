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

import { AgentMessage } from "@app/components/assistant/conversation/AgentMessage";
import { ContentFragment } from "@app/components/assistant/conversation/ContentFragment";
import { CONVERSATION_PARENT_SCROLL_DIV_ID } from "@app/components/assistant/conversation/lib";
import { UserMessage } from "@app/components/assistant/conversation/UserMessage";
import { useEventSource } from "@app/hooks/useEventSource";
import {
  useConversation,
  useConversationMessages,
  useConversationReactions,
  useConversations,
} from "@app/lib/swr";
import { classNames } from "@app/lib/utils";

const PAGE_SIZE = 10;

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
  isFading = false,
}: {
  owner: WorkspaceType;
  user: UserType;
  conversationId: string;
  onStickyMentionsChange?: (mentions: AgentMention[]) => void;
  isInModal?: boolean;
  hideReactions?: boolean;
  isFading?: boolean;
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

  const {
    mutateMessages,
    messages,
    size,
    setSize,
    isMessagesLoading,
    isLoadingInitialData,
    isValidating,
  } = useConversationMessages({
    conversationId,
    workspaceId: owner.sId,
  });

  const { reactions } = useConversationReactions({
    workspaceId: owner.sId,
    conversationId,
  });

  const { ref, inView } = useInView();
  // This does not work!
  // We could remove this if the endpoint returns the total number of messages.
  const lastMessageIds = useMemo(() => {
    const lastPage = messages.at(-1);
    if (!lastPage) {
      return null;
    }

    return new Set([...lastPage.messages.map((m) => m.sId)]);
  }, [messages]);

  // console.log(">> lastMessageIds:", lastMessageIds);

  // This work!
  // Always check the most recent page.
  const totalMessages = useMemo(() => messages.at(-1)?.total, [messages]);

  console.log(">> messages:", messages);
  console.log(">> lastMessageIds:", lastMessageIds);

  const latestMessageIdRef = useRef<string | null>(null);
  // TODO:
  useEffect(() => {
    const lastestMessageId = messages.at(-1)?.messages.at(-1)?.sId;
    if (lastestMessageId && latestMessageIdRef.current !== lastestMessageId) {
      const mainTag = document.getElementById(
        CONVERSATION_PARENT_SCROLL_DIV_ID[isInModal ? "modal" : "page"]
      );
      if (mainTag) {
        console.log(">> scrolling down!");
        mainTag.scrollTo(0, mainTag.scrollHeight);
      }

      latestMessageIdRef.current = lastestMessageId;
    }
  }, [isInModal, messages]);

  const [prevFirstMessageIndex, setPrevFirstMessageIndex] = useState<
    string | null
  >(null);
  const prevFirstMessageRef = useRef(null);

  useEffect(() => {
    if (
      prevFirstMessageIndex &&
      prevFirstMessageRef.current &&
      !isMessagesLoading &&
      !isValidating
    ) {
      console.log(">> moving to previous message");
      prevFirstMessageRef.current.scrollIntoView({
        behavior: "instant",
        block: "start",
      });
      setPrevFirstMessageIndex(null);
    }
  }, [
    prevFirstMessageIndex,
    prevFirstMessageRef,
    isMessagesLoading,
    isValidating,
  ]);

  useEffect(() => {
    if (!onStickyMentionsChange) {
      return;
    }

    const lastUserMessage = messages
      .at(-1)
      ?.messages.findLast(
        (message) =>
          isUserMessageType(message) &&
          message.visibility !== "deleted" &&
          message.user?.id === user.id
      );

    if (!lastUserMessage) {
      return;
    }

    if (!lastUserMessage || !isUserMessageType(lastUserMessage)) {
      return;
    }

    const { mentions } = lastUserMessage;
    const agentMentions = mentions.filter(isAgentMention);
    onStickyMentionsChange(agentMentions);
  }, [messages, onStickyMentionsChange, user.id]);

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

  const hasMore = messages.at(0)?.messages.length === PAGE_SIZE;
  useEffect(() => {
    // console.log(">> inView:", inView);
    // console.log(">> isMessagesLoading:", isMessagesLoading);
    // console.log(">> hasMore:", hasMore);
    // console.log(">> isLoadingInitialData:", isLoadingInitialData);
    if (
      !isLoadingInitialData &&
      inView &&
      !isMessagesLoading &&
      hasMore &&
      !isValidating &&
      !prevFirstMessageIndex
    ) {
      console.log(
        "> seeting prev first message to:",
        messages.length > 0 ? messages.at(0)?.messages[0]?.sId ?? null : null
      );
      setPrevFirstMessageIndex(
        messages.length > 0 ? messages.at(0)?.messages[0]?.sId ?? null : null
      );
      void setSize(size + 1);
    }
  }, [
    inView,
    isMessagesLoading,
    isLoadingInitialData,
    hasMore,
    setSize,
    size,
    isValidating,
    setPrevFirstMessageIndex,
    prevFirstMessageIndex,
    messages,
  ]);

  useEventSource(buildEventSourceURL, onEventCallback, {
    // We only start consuming the stream when the conversation has been loaded.
    isReadyToConsumeStream: !isConversationLoading && messages.length !== 0,
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
      {hasMore && !isMessagesLoading && !prevFirstMessageIndex && (
        <button
          ref={ref}
          onClick={() => {
            void setSize(size + 1);
          }}
        >
          {inView ? "loading more" : "sleeping"}!
        </button>
      )}
      {(isMessagesLoading || prevFirstMessageIndex) && (
        <div>Loading more...</div>
      )}
      {messages.map((page) => {
        return page.messages.map((m) => {
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
                  ref={
                    m.sId === prevFirstMessageIndex ? prevFirstMessageRef : null
                  }
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
                <div
                  key={`message-id-${m.sId}`}
                  className="px-2 py-8"
                  ref={
                    m.sId === prevFirstMessageIndex ? prevFirstMessageRef : null
                  }
                >
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
                  className="items-center bg-structure-50 px-2 pt-8"
                  ref={
                    m.sId === prevFirstMessageIndex ? prevFirstMessageRef : null
                  }
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
        });
      })}
    </div>
  );
}
