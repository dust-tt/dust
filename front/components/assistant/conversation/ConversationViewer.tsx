import type {
  ListScrollLocation,
  VirtuosoMessageListMethods,
} from "@virtuoso.dev/message-list";
import {
  VirtuosoMessageList,
  VirtuosoMessageListLicense,
} from "@virtuoso.dev/message-list";
import _ from "lodash";
import debounce from "lodash/debounce";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { AssistantInputBar } from "@app/components/assistant/conversation/AssistantInputBar";
import { useCoEditionContext } from "@app/components/assistant/conversation/co_edition/context";
import { ConversationErrorDisplay } from "@app/components/assistant/conversation/ConversationError";
import type { EditorMention } from "@app/components/assistant/conversation/input_bar/editor/useCustomEditor";
import {
  createPlaceholderAgentMessage,
  createPlaceholderUserMessage,
  submitMessage,
} from "@app/components/assistant/conversation/lib";
import { MessageItem } from "@app/components/assistant/conversation/MessageItem";
import type {
  VirtuosoMessage,
  VirtuosoMessageListContext,
} from "@app/components/assistant/conversation/types";
import {
  areSameRank,
  getMessageRank,
  isMessageTemporayState,
  isUserMessage,
  makeInitialMessageStreamState,
} from "@app/components/assistant/conversation/types";
import { ConversationViewerEmptyState } from "@app/components/assistant/ConversationViewerEmptyState";
import { useEventSource } from "@app/hooks/useEventSource";
import { useSendNotification } from "@app/hooks/useNotification";
import { getLightAgentMessageFromAgentMessage } from "@app/lib/api/assistant/citations";
import type { AgentMessageFeedbackType } from "@app/lib/api/assistant/feedback";
import { getUpdatedParticipantsFromEvent } from "@app/lib/client/conversation/event_handlers";
import type { DustError } from "@app/lib/error";
import {
  useConversation,
  useConversationFeedbacks,
  useConversationMarkAsRead,
  useConversationMessages,
  useConversationParticipants,
  useConversations,
} from "@app/lib/swr/conversations";
import { classNames } from "@app/lib/utils";
import type {
  AgentGenerationCancelledEvent,
  AgentMessageDoneEvent,
  AgentMessageNewEvent,
  ContentFragmentsType,
  ContentFragmentType,
  ConversationTitleEvent,
  LightMessageType,
  Result,
  UserMessageNewEvent,
  UserType,
  WorkspaceType,
} from "@app/types";
import {
  Err,
  isContentFragmentType,
  isUserMessageType,
  Ok,
  removeNulls,
} from "@app/types";

const DEFAULT_PAGE_LIMIT = 50;

interface ConversationViewerProps {
  conversationId: string;
  agentBuilderContext?: VirtuosoMessageListContext["agentBuilderContext"];
  setPlanLimitReached?: (planLimitReached: boolean) => void;
  owner: WorkspaceType;
  user: UserType;
}

function easeOutQuint(x: number): number {
  return 1 - Math.pow(1 - x, 5);
}

function customSmoothScroll() {
  return {
    animationFrameCount: 30,
    easing: easeOutQuint,
  };
}
/**
 *
 * @param isInModal is the conversation happening in a side modal, i.e. when testing an assistant?
 * @returns
 */
export const ConversationViewer = ({
  owner,
  user,
  conversationId,
  agentBuilderContext,
  setPlanLimitReached,
}: ConversationViewerProps) => {
  const ref =
    useRef<
      VirtuosoMessageListMethods<VirtuosoMessage, VirtuosoMessageListContext>
    >(null);
  const sendNotification = useSendNotification();
  const { serverId } = useCoEditionContext();

  const {
    conversation,
    conversationError,
    isConversationLoading,
    mutateConversation,
  } = useConversation({
    conversationId,
    workspaceId: owner.sId,
  });

  const { markAsRead } = useConversationMarkAsRead({
    conversation,
    workspaceId: owner.sId,
  });

  const { mutateConversations } = useConversations({
    workspaceId: owner.sId,
    options: {
      disabled: true,
    },
  });

  const {
    isLoadingInitialData,
    isMessagesLoading,
    isValidating,
    messages,
    setSize,
    size,
    mutateMessages,
  } = useConversationMessages({
    conversationId,
    workspaceId: owner.sId,
    limit: DEFAULT_PAGE_LIMIT,
  });

  const { mutateConversationParticipants } = useConversationParticipants({
    conversationId,
    workspaceId: owner.sId,
    options: { disabled: true }, // We don't need the participants, only the mutator.
  });

  const [initialListData, setInitialListData] = useState<
    VirtuosoMessage[] | undefined
  >(undefined);

  // Setup the initial list data when the conversation is loaded.
  useEffect(() => {
    if (!initialListData && messages.length > 0) {
      const messagesToRender = convertLightMessageTypeToVirtuosoMessages(
        messages.flatMap((m) => m.messages)
      );

      setInitialListData(messagesToRender);
    }
  }, [initialListData, messages, setInitialListData]);

  // This is to handle we just fetched more messages by scrolling up.
  useEffect(() => {
    // don't do anything until we have a first page of messages.
    if (!ref.current || !ref.current.data.get().length) {
      return;
    }

    // We use the messages ranks to know what is older and what is newer.
    const ranks = ref.current.data.get().map(getMessageRank);

    const minRank = Math.min(...ranks);

    const messagesFromBackend = messages.flatMap((m) => m.messages);

    const olderMessagesFromBackend = messagesFromBackend.filter(
      (m) => m.rank < minRank
    );

    if (olderMessagesFromBackend.length > 0) {
      ref.current.data.prepend(
        convertLightMessageTypeToVirtuosoMessages(olderMessagesFromBackend)
      );
    }

    const maxRank = Math.max(...ranks);

    const recentMessagesFromBackend = messagesFromBackend.filter(
      (m) => m.rank > maxRank
    );

    if (recentMessagesFromBackend.length > 0) {
      ref.current.data.append(
        convertLightMessageTypeToVirtuosoMessages(recentMessagesFromBackend)
      );
    }
  }, [messages]);

  const { feedbacks } = useConversationFeedbacks({
    conversationId: conversationId ?? "",
    workspaceId: owner.sId,
  });

  // Hooks related to conversation events streaming.

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

  const debouncedMarkAsRead = useMemo(
    () => debounce(markAsRead, 2000),
    [markAsRead]
  );

  const eventIds = useRef<string[]>([]);

  // Only conversation related events are handled here.
  const onEventCallback = useCallback(
    (eventStr: string) => {
      const eventPayload: {
        eventId: string;
        data:
          | UserMessageNewEvent
          | AgentMessageNewEvent
          | AgentMessageDoneEvent
          | AgentGenerationCancelledEvent
          | ConversationTitleEvent;
      } = JSON.parse(eventStr);
      const event = eventPayload.data;

      if (!eventIds.current.includes(eventPayload.eventId)) {
        eventIds.current.push(eventPayload.eventId);
        switch (event.type) {
          case "user_message_new":
            if (ref.current) {
              const userMessage: VirtuosoMessage = {
                ...event.message,
                contentFragments: [],
              };
              const predicate = (m: VirtuosoMessage) =>
                isUserMessage(m) && areSameRank(m, userMessage);

              const exists = ref.current.data.find(predicate);

              if (!exists) {
                ref.current.data.append([
                  { ...event.message, contentFragments: [] },
                ]);
              } else {
                // We don't update if it already exists as if it already exists, it means we have received the message from the backend.
              }

              void mutateConversationParticipants(
                async (participants) =>
                  getUpdatedParticipantsFromEvent(participants, event),
                { revalidate: false }
              );
            }
            break;
          case "agent_message_new":
            if (ref.current) {
              const messageStreamState = makeInitialMessageStreamState(
                getLightAgentMessageFromAgentMessage(event.message)
              );

              // Replace the message in the exist list data, or append.
              const predicate = (m: VirtuosoMessage) =>
                isMessageTemporayState(m) && areSameRank(m, messageStreamState);
              const exists = ref.current.data.find(predicate);

              if (exists) {
                ref.current.data.map((m) =>
                  predicate(m) ? messageStreamState : m
                );
              } else {
                ref.current.data.append([messageStreamState]);
              }

              void mutateConversationParticipants(async (participants) =>
                getUpdatedParticipantsFromEvent(participants, event)
              );
            }
            break;

          case "agent_generation_cancelled":
            void mutateMessages();
            break;

          case "conversation_title":
            void mutateConversation(
              (current) => {
                if (current) {
                  return {
                    ...current,
                    conversation: {
                      ...current.conversation,
                      title: event.title,
                    },
                  };
                }
              },
              { revalidate: false }
            );

            // to refresh the list of convos in the sidebar (title)
            void mutateConversations(
              (currentData) => {
                if (currentData?.conversations) {
                  return {
                    ...currentData,
                    conversations: currentData.conversations.map((c) =>
                      c.sId === conversationId
                        ? { ...c, title: event.title }
                        : c
                    ),
                  };
                }
              },
              { revalidate: false }
            );

            break;
          case "agent_message_done":
            // Mark as read and do not mutate the list of convos in the sidebar to avoid useless network request.
            // Debounce the call as we might receive multiple events for the same conversation (as we replay the events).
            void debouncedMarkAsRead(event.conversationId, false);

            // Mutate the messages to be sure that the swr cache is updated.
            // Fixes an issue where the last message of a conversation is "thinking" and not "done" the first time you switch back and forth to a conversation.
            void mutateMessages();
            break;
          default:
            ((t: never) => {
              console.error("Unknown event type", t);
            })(event);
        }
      }
    },
    [
      conversationId,
      debouncedMarkAsRead,
      mutateConversation,
      mutateConversationParticipants,
      mutateConversations,
      mutateMessages,
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

  const handleSubmit = useCallback(
    async (
      input: string,
      mentions: EditorMention[],
      contentFragments: ContentFragmentsType
    ): Promise<Result<undefined, DustError>> => {
      if (!ref?.current) {
        return new Err({
          code: "internal_error",
          name: "NoRef",
          message: "No ref",
        });
      }
      const messageData = {
        input,
        mentions: mentions.map((mention) => ({ configurationId: mention.id })),
        contentFragments,
        clientSideMCPServerIds: removeNulls([serverId]),
      };

      const lastMessageRank = Math.max(
        ...ref.current.data.get().map(getMessageRank)
      );

      let rank =
        lastMessageRank +
        // Content fragments are prepended as "message" in the conversation, before the user message.
        // We need to account for their ranks as well.
        contentFragments.contentNodes.length +
        contentFragments.uploaded.length +
        // +1 for the user message
        1;
      const placeholderUserMsg: VirtuosoMessage = createPlaceholderUserMessage({
        input,
        mentions,
        user,
        rank,
        contentFragments,
      });

      const placeholderAgentMsgs: VirtuosoMessage[] = [];
      for (const mention of mentions) {
        // +1 per agent message mentionned
        rank += 1;
        placeholderAgentMsgs.push(
          createPlaceholderAgentMessage({
            mention,
            rank,
          })
        );
      }

      const nbMessages = ref.current.data.get().length;
      ref.current.data.append(
        [placeholderUserMsg, ...placeholderAgentMsgs],
        () => {
          return {
            index: nbMessages, // Avoid jumping around when the agent message is generated.
            align: "start",
            behavior: customSmoothScroll,
          };
        }
      );

      const result = await submitMessage({
        owner,
        user,
        conversationId,
        messageData,
      });

      if (result.isErr()) {
        if (result.error.type === "plan_limit_reached_error") {
          setPlanLimitReached?.(true);
        } else {
          sendNotification({
            title: result.error.title,
            description: result.error.message,
            type: "error",
          });
        }

        // If the API errors, the original data will be rolled back by SWR automatically.
        console.error("Failed to post message:", result.error);
        return new Err({
          code: "internal_error",
          name: "FailedToPostMessage",
          message: `Failed to post message ${result.error}`,
        });
      }

      const {
        message: messageFromBackend,
        contentFragments: contentFragmentsFromBackend,
      } = result.value;

      // map() is how we update the state of virtuoso messages.
      ref.current.data.map((m) =>
        areSameRank(m, placeholderUserMsg)
          ? {
              ...messageFromBackend,
              contentFragments: contentFragmentsFromBackend,
            }
          : m
      );

      await mutateConversations();

      return new Ok(undefined);
    },
    [
      serverId,
      user,
      owner,
      conversationId,
      mutateConversations,
      setPlanLimitReached,
      sendNotification,
    ]
  );

  const onScroll = useCallback(
    (location: ListScrollLocation) => {
      const isLoadingData =
        isLoadingInitialData || isMessagesLoading || isValidating;

      if (
        location.listOffset >= -100 &&
        messages.at(0)?.hasMore &&
        !isLoadingData
      ) {
        // Increment the page number to load more data.
        void setSize(size + 1);
      }
    },
    [
      isLoadingInitialData,
      isMessagesLoading,
      isValidating,
      setSize,
      size,
      messages,
    ]
  );

  const computeItemKey = useCallback(
    ({
      data,
      context,
    }: {
      data: VirtuosoMessage;
      context: VirtuosoMessageListContext;
    }) => {
      return `conversation-${context.conversationId}-message-rank-${isMessageTemporayState(data) ? data.message.rank : data.rank}`;
    },
    []
  );

  const itemIdentity = useCallback((item: VirtuosoMessage) => {
    return `message-rank-${isMessageTemporayState(item) ? item.message.rank : item.rank}`;
  }, []);

  const feedbacksByMessageId = useMemo(() => {
    return feedbacks.reduce(
      (acc, feedback) => {
        acc[feedback.messageId] = feedback;
        return acc;
      },
      {} as Record<string, AgentMessageFeedbackType>
    );
  }, [feedbacks]);

  const context = useMemo(() => {
    return {
      user,
      owner,
      handleSubmit,
      conversationId,
      agentBuilderContext,
      feedbacksByMessageId,
    };
  }, [
    user,
    owner,
    handleSubmit,
    conversationId,
    agentBuilderContext,
    feedbacksByMessageId,
  ]);

  return (
    <>
      {conversationError && (
        <ConversationErrorDisplay error={conversationError} />
      )}
      <VirtuosoMessageListLicense
        licenseKey={process.env.NEXT_PUBLIC_VIRTUOSO_LICENSE_KEY ?? ""}
      >
        <VirtuosoMessageList<VirtuosoMessage, VirtuosoMessageListContext>
          data={{
            data: initialListData,
            scrollModifier: {
              type: "item-location",
              location: {
                index: "LAST",
                align: "end",
                behavior: "instant",
              },
              purgeItemSizes: true,
            },
          }}
          initialLocation={{
            index: "LAST",
            align: "end",
            behavior: "instant",
          }}
          ref={ref}
          ItemContent={MessageItem}
          StickyFooter={AssistantInputBar}
          // Note: do NOT put any verticalpadding here as it will mess with the auto scroll to bottom.
          className={classNames(
            "dd-privacy-mask",
            "s-@container/conversation",
            "h-full w-full",
            agentBuilderContext ? "px-4" : "px-4 md:px-8"
          )}
          shortSizeAlign="top"
          computeItemKey={computeItemKey}
          onScroll={onScroll}
          context={context}
          itemIdentity={itemIdentity}
          EmptyPlaceholder={ConversationViewerEmptyState}
          // Large buffer to avoid manipulating the dom too much when the user scrolls a bit.
          increaseViewportBy={8192}
          enforceStickyFooterAtBottom={true}
        />
      </VirtuosoMessageListLicense>
    </>
  );
};

const convertLightMessageTypeToVirtuosoMessages = (
  messages: LightMessageType[]
) => {
  const output: VirtuosoMessage[] = [];
  let tempContentFragments: ContentFragmentType[] = [];

  messages.forEach((message) => {
    if (isContentFragmentType(message)) {
      tempContentFragments.push(message); // Collect content fragments.
    } else {
      let messageWithContentFragments: VirtuosoMessage;
      if (isUserMessageType(message)) {
        // Attach collected content fragments to the user message.
        messageWithContentFragments = {
          ...message,
          contentFragments: tempContentFragments,
        };
        tempContentFragments = []; // Reset the collected content fragments.

        // Start a new group for user messages.
        output.push(messageWithContentFragments);
      } else {
        messageWithContentFragments = makeInitialMessageStreamState(message);
        output.push(messageWithContentFragments);
      }
    }
  });
  return output;
};
