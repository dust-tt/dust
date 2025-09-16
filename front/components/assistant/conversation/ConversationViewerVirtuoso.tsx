import { Spinner } from "@dust-tt/sparkle";
import type {
  ListScrollLocation,
  VirtuosoMessageListProps,
} from "@virtuoso.dev/message-list";
import {
  VirtuosoMessageList,
  VirtuosoMessageListLicense,
} from "@virtuoso.dev/message-list";
import debounce from "lodash/debounce";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { useCoEditionContext } from "@app/components/assistant/conversation/co_edition/context";
import { ConversationErrorDisplay } from "@app/components/assistant/conversation/ConversationError";
import { useConversationSidePanelContext } from "@app/components/assistant/conversation/ConversationSidePanelContext";
import { AssistantInputBar } from "@app/components/assistant/conversation/input_bar/InputBar";
import {
  createPlaceholderUserMessage,
  submitMessage,
} from "@app/components/assistant/conversation/lib";
import MessageItemVirtuoso from "@app/components/assistant/conversation/MessageItemVirtuoso";
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
  useExecutionMode,
} from "@app/lib/swr/conversations";
import { classNames } from "@app/lib/utils";
import type {
  AgentGenerationCancelledEvent,
  AgentMention,
  AgentMessageDoneEvent,
  AgentMessageNewEvent,
  ContentFragmentsType,
  ContentFragmentType,
  ConversationTitleEvent,
  FetchConversationMessagesResponse,
  MentionType,
  MessageWithContentFragmentsType,
  Result,
  UserMessageNewEvent,
  UserType,
  WorkspaceType,
} from "@app/types";
import {
  Err,
  isAgentMention,
  isAgentMessageType,
  isContentFragmentType,
  isUserMessageType,
  Ok,
  removeNulls,
} from "@app/types";

/* TODO:
 - handle position when loading more messages with infinite scroll.
 - add date indicator back
 - filter out like in groupMessagesByType
*/

const DEFAULT_PAGE_LIMIT = 50;

type VirtuosoMessageListContext = {
  conversationId: string;
  isInModal: boolean;
  feedbacksByMessageId: Record<string, AgentMessageFeedbackType>;
};

interface ConversationViewerProps {
  conversationId: string;
  isInModal?: boolean;
  setPlanLimitReached?: (planLimitReached: boolean) => void;
  stickyMentions?: AgentMention[];
  onStickyMentionsChange: (mentions: AgentMention[]) => void;
  owner: WorkspaceType;
  user: UserType;
}

/**
 *
 * @param isInModal is the conversation happening in a side modal, i.e. when testing an assistant?
 * @returns
 */
const ConversationViewerVirtuoso = (
  {
    owner,
    user,
    conversationId,
    onStickyMentionsChange,
    isInModal = false,
    stickyMentions,
    setPlanLimitReached,
  } : ConversationViewerProps
) => {
  const sendNotification = useSendNotification();
  const { serverId } = useCoEditionContext();
  const executionMode = useExecutionMode();

  const { currentPanel } = useConversationSidePanelContext();

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
    mutateMessages,
    setSize,
    size,
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

  const { hasMore, latestPage } = useMemo(() => {
    return {
      hasMore: messages.at(0)?.hasMore,
      latestPage: messages.at(-1),
      //oldestPage: messages.at(0),
    };
  }, [messages]);

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
          case "agent_message_new":
            // TODO update listData

            // // Temporarily add agent message using event payload until revalidation.
            // void mutateMessages(async (currentMessagePages) => {
            //   return getUpdatedMessagesFromEvent(currentMessagePages, event);
            // });
            if (
              event.type === "user_message_new" &&
              event.message.user?.id === user.id
            ) {
              return;
            }
            setListData((current) => {
              const messages = [...(current?.data ?? [])];

              const finalMessage: MessageWithContentFragmentsType =
                isAgentMessageType(event.message)
                  ? {
                      ...getLightAgentMessageFromAgentMessage(event.message),
                      rank: event.message.rank,
                      version: event.message.version,
                    }
                  : event.message;

              // Replace the message in the exist list data, append to after the last message of the same or lower rank, finally, at the end.
              const index = messages.findIndex(
                (m) => m.sId === finalMessage.sId
              );

              console.log(`Found message at index ${index}`, finalMessage);

              if (index !== -1) {
                messages[index] = finalMessage;
              } else {
                const lastIndexWithSameOrLowerRank = messages.findLastIndex(
                  (m) => m.rank <= finalMessage.rank
                );
                if (lastIndexWithSameOrLowerRank !== -1) {
                  messages.splice(
                    lastIndexWithSameOrLowerRank + 1,
                    0,
                    finalMessage
                  );
                } else {
                  messages.push(finalMessage);
                }
              }

              console.log("messages after update", messages);

              return {
                data: messages,
                scrollModifier: undefined,
              };
            });

            void mutateConversationParticipants(async (participants) => {
              return getUpdatedParticipantsFromEvent(participants, event);
            });
            break;

          case "agent_generation_cancelled":
            // TODO update listData
            // void mutateMessages();
            break;

          case "conversation_title":
            void mutateConversation();
            void mutateConversations(); // to refresh the list of convos in the sidebar (title)
            break;
          case "agent_message_done":
            // Mark as read and do not mutate the list of convos in the sidebar to avoid useless network request.
            // Debounce the call as we might receive multiple events for the same conversation (as we replay the events).
            void debouncedMarkAsRead(event.conversationId, false);

            // Mutate the messages to be sure that the swr cache is updated.
            // Fixes an issue where the last message of a conversation is "thinking" and not "done" the first time you switch back and forth to a conversation.
            // TODO update listData
            // void mutateMessages();
            break;
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
      debouncedMarkAsRead,
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

  const [listData, setListData] =
    useState<
      VirtuosoMessageListProps<
        MessageWithContentFragmentsType,
        VirtuosoMessageListContext
      >["data"]
    >(null);

  useEffect(() => {
    if (!listData && messages.length > 0) {
      console.log("Setting listData with messages", messages);
      const typedGroupedMessages = groupMessagesByType(messages);
      const messagesToRender = typedGroupedMessages.flat();
      setListData({
        data: messagesToRender,
        scrollModifier: {
          type: "item-location",
          location: {
            index: "LAST",
            align: "end",
          },
          purgeItemSizes: true,
        },
      });
    }
  }, [listData, messages, setListData]);

  const handleSubmit = useCallback(
    async (
      input: string,
      mentions: MentionType[],
      contentFragments: ContentFragmentsType
    ): Promise<Result<undefined, DustError>> => {
      const messageData = {
        input,
        mentions,
        contentFragments,
        clientSideMCPServerIds: removeNulls([serverId]),
      };

      const lastMessageRank = listData?.data?.at(-1)?.rank ?? 0;

      const placeholderMessage = createPlaceholderUserMessage({
        input,
        mentions,
        user,
        lastMessageRank,
      });

      setListData((current) => {
        const messages = [...(current?.data ?? []), placeholderMessage];
        return {
          data: messages,
          scrollModifier: {
            type: "auto-scroll-to-bottom",
            autoScroll: () => {
              return {
                index: messages.length - 1, // Avoid jumping around when the agent message is generated.
                align: "start",
                behavior: "smooth",
              };
            },
          },
        };
      });

      const result = await submitMessage({
        owner,
        user,
        conversationId,
        messageData,
        executionMode,
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

      const { message } = result.value;

      setListData((current) => {
        const messages = [...(current?.data ?? [])];

        const indexOfPlaceHolder = messages.findIndex(
          (m) => m.sId === placeholderMessage.sId
        );

        if (indexOfPlaceHolder !== -1) {
          // If the placeholder is in the list, we delete it.
          messages.splice(indexOfPlaceHolder, 1);
        }

        // We might already have received the message via the conversation event.
        const indexOfMessage = messages.findIndex((m) => m.sId === message.sId);

        // If the message is already in the list, replace with the new message from backend end.
        if (indexOfMessage !== -1) {
          messages.splice(indexOfMessage, 1, message);
        }
        // Otherwise, we put it where the placeholder was.
        else {
          messages.splice(indexOfPlaceHolder, 0, message);
        }

        console.log("messages after submit", messages);

        return {
          data: messages,
          scrollModifier: undefined,
        };
      });

      //await mutateMessages();
      await mutateConversations();

      return new Ok(undefined);
    },
    [
      serverId,
      listData?.data,
      user,
      owner,
      conversationId,
      executionMode,
      mutateConversations,
      setPlanLimitReached,
      sendNotification,
    ]
  );

  const onScroll = useCallback(
    (location: ListScrollLocation) => {
      const isLoadingData =
        isLoadingInitialData || isMessagesLoading || isValidating;

      if (location.listOffset >= -100 && hasMore && !isLoadingData) {
        // Increment the page number to load more data.
        void setSize(size + 1);
      }
    },
    [
      hasMore,
      isLoadingInitialData,
      isMessagesLoading,
      isValidating,
      setSize,
      size,
    ]
  );

  const computeItemKey = useCallback(
    ({ data }: { data: MessageWithContentFragmentsType }) => {
      return `message-id-${data.sId}`;
    },
    []
  );

  const feedbacksByMessageId = useMemo(() => {
    return feedbacks.reduce(
      (acc, feedback) => {
        acc[feedback.messageId] = feedback;
        return acc;
      },
      {} as Record<string, AgentMessageFeedbackType>
    );
  }, [feedbacks]);

  const WrappedMessageItem = useCallback(
    ({
      data,
      context,
      index,
      nextData,
    }: {
      data: MessageWithContentFragmentsType;
      context: VirtuosoMessageListContext;
      index: number;
      nextData: MessageWithContentFragmentsType | null;
    }) => (
      <MessageItemVirtuoso
        index={index}
        message={data}
        messageFeedback={context.feedbacksByMessageId[data.sId]}
        conversationId={context!.conversationId}
        isInModal={context.isInModal}
        isLastMessage={!nextData}
        owner={owner}
        user={user}
      />
    ),
    [owner, user]
  );

  const WrappedFixedAssistantInputBar = useCallback(
    ({
      context,
    }: {
      context: { conversationId: string; isInModal: boolean };
    }) => (
      <div
        className={classNames(
          "mx-auto",
          "z-20 flex max-h-screen w-full",
          "py-2",
          "sm:w-full sm:max-w-3xl sm:py-4"
        )}
      >
        <AssistantInputBar
          owner={owner}
          onSubmit={handleSubmit}
          stickyMentions={stickyMentions}
          conversationId={context.conversationId}
          disableAutoFocus={false}
        />
      </div>
    ),
    [handleSubmit, owner, stickyMentions]
  );

  return (
    <>
      {conversationError && (
        <ConversationErrorDisplay error={conversationError} />
      )}
      {listData?.data?.length ?? 0 > 0 ? (
        <VirtuosoMessageListLicense licenseKey="">
          <VirtuosoMessageList<
            MessageWithContentFragmentsType,
            {
              conversationId: string;
              isInModal: boolean;
              feedbacksByMessageId: Record<string, AgentMessageFeedbackType>;
            }
          >
            data={listData}
            ItemContent={WrappedMessageItem}
            className={classNames(
              "dd-privacy-mask",
              "s-@container/conversation",
              "h-full w-full pt-4",
              isInModal ? "pt-4" : "px-4 md:px-8",
              // Hide conversation on mobile when any panel is opened.
              currentPanel ? "hidden md:block" : ""
            )}
            shortSizeAlign="bottom"
            StickyFooter={WrappedFixedAssistantInputBar}
            computeItemKey={computeItemKey}
            onScroll={onScroll}
            context={{
              conversationId,
              isInModal,
              feedbacksByMessageId,
            }}
          />
        </VirtuosoMessageListLicense>
      ) : (
        <div className="flex w-full flex-1 flex-col items-center justify-center gap-8 py-4">
          <Spinner variant="color" size="xl" />
        </div>
      )}
    </>
  );
});

export default ConversationViewerVirtuoso;

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
  messages: FetchConversationMessagesResponse[]
): MessageWithContentFragmentsType[][] => {
  const groupedMessages: MessageWithContentFragmentsType[][] = [];
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
            contentFragments: tempContentFragments,
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
