import { ConversationViewerEmptyState } from "@app/components/assistant/ConversationViewerEmptyState";
import { AgentInputBar } from "@app/components/assistant/conversation/AgentInputBar";
import { ConversationBranchApprovalModal } from "@app/components/assistant/conversation/ConversationBranchApprovalModal";
import { ConversationErrorDisplay } from "@app/components/assistant/conversation/ConversationError";
import {
  parseDataAsMessageIdAndActionId,
  useConversationSidePanelContext,
} from "@app/components/assistant/conversation/ConversationSidePanelContext";
import {
  createPlaceholderAgentMessage,
  createPlaceholderUserMessage,
} from "@app/components/assistant/conversation/lib";
import { MessageItem } from "@app/components/assistant/conversation/MessageItem";
import type {
  VirtuosoMessage,
  VirtuosoMessageListContext,
} from "@app/components/assistant/conversation/types";
import {
  areSameRankAndBranch,
  convertLightMessageTypeToVirtuosoMessages,
  getPredicateForRankAndBranch,
  isAgentMessageWithStreaming,
  isUserMessage,
  makeInitialMessageStreamState,
} from "@app/components/assistant/conversation/types";
import {
  useConversation,
  useConversationFeedbacks,
  useConversationMarkAsRead,
  useConversationMessages,
  useConversationParticipants,
  useConversations,
} from "@app/hooks/conversations";
import { useConversationAttachments } from "@app/hooks/conversations/useConversationAttachments";
import { useConversationEvents } from "@app/hooks/useConversationEvents";
import { useEnableBrowserNotification } from "@app/hooks/useEnableBrowserNotification";
import { useSendNotification } from "@app/hooks/useNotification";
import { useSubmitMessage } from "@app/hooks/useSubmitMessage";
import { getLightAgentMessageFromAgentMessage } from "@app/lib/api/assistant/citations";
import type { AgentMessageFeedbackType } from "@app/lib/api/assistant/feedback";
import type { ConversationEvents } from "@app/lib/api/assistant/streaming/types";
import { getUpdatedParticipantsFromEvent } from "@app/lib/client/conversation/event_handlers";
import type { DustError } from "@app/lib/error";
import { AgentMessageCompletedEvent } from "@app/lib/notifications/events";
import { useSpaceInfo } from "@app/lib/swr/spaces";
import logger from "@app/logger/logger";
import {
  type ConversationWithoutContentType,
  isUserMessageTypeWithContentFragments,
} from "@app/types/assistant/conversation";
import type { RichMention } from "@app/types/assistant/mentions";
import {
  isRichAgentMention,
  toMentionType,
} from "@app/types/assistant/mentions";
import type { ContentFragmentsType } from "@app/types/content_fragment";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import type { UserType, WorkspaceType } from "@app/types/user";
import { cn } from "@dust-tt/sparkle";
import type {
  ListScrollLocation,
  VirtuosoMessageListMethods,
} from "@virtuoso.dev/message-list";
import {
  VirtuosoMessageList,
  VirtuosoMessageListLicense,
} from "@virtuoso.dev/message-list";
import debounce from "lodash/debounce";
// biome-ignore lint/correctness/noUnusedImports: ignored using `--suppress`
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { Components } from "react-markdown";
import type { PluggableList } from "react-markdown/lib/react-markdown";
import { findFirstUnreadMessageIndex } from "./utils";

const DEFAULT_PAGE_LIMIT = 50;

// A conversation must be unread and older than that to enable the suggestion of enabling notifications.
const DELAY_BEFORE_SUGGESTING_PUSH_NOTIFICATION_ACTIVATION = 60 * 60 * 1000; // 1 hour

interface ConversationViewerProps {
  conversationId: string;
  agentBuilderContext?: VirtuosoMessageListContext["agentBuilderContext"];
  additionalMarkdownComponents?: Components;
  additionalMarkdownPlugins?: PluggableList;
  setPlanLimitReached?: (planLimitReached: boolean) => void;
  owner: WorkspaceType;
  user: UserType;
  clientSideMCPServerIds?: string[];
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

export function getBranchedInsertIndex(
  data: VirtuosoMessage[],
  newMessage: VirtuosoMessage
): number {
  // Branches (other than the new message's branch) that already contain
  // a message with the same rank. We want to keep *all* messages from
  // those branches contiguous and insert after their last message.
  const blockingBranches = new Set<string>();
  for (const m of data) {
    if (
      m.rank === newMessage.rank &&
      m.branchId !== null &&
      m.branchId !== undefined &&
      m.branchId !== newMessage.branchId
    ) {
      blockingBranches.add(m.branchId);
    }
  }

  let insertIndex = 0;

  for (let i = 0; i < data.length; i += 1) {
    const m = data[i];
    const branchId = m.branchId;

    const isBlockingBranchMessage =
      branchId !== null &&
      branchId !== undefined &&
      blockingBranches.has(branchId);

    const isSameBranchPriorOrEqualRank =
      branchId === newMessage.branchId && m.rank <= newMessage.rank;

    if (isBlockingBranchMessage || isSameBranchPriorOrEqualRank) {
      insertIndex = i + 1;
    }
  }

  if (insertIndex > 0) {
    return insertIndex;
  }

  // Fallback: original behavior – insert before the first message
  // with a strictly greater rank, or append if none.
  const rankOffset = data.findIndex((m) => m.rank > newMessage.rank);
  return rankOffset === -1 ? data.length : rankOffset;
}

export const ConversationViewer = ({
  owner,
  user,
  conversationId,
  agentBuilderContext,
  additionalMarkdownComponents,
  additionalMarkdownPlugins,
  setPlanLimitReached,
  clientSideMCPServerIds,
}: ConversationViewerProps) => {
  const ref =
    useRef<
      VirtuosoMessageListMethods<VirtuosoMessage, VirtuosoMessageListContext>
    >(null);
  const sendNotification = useSendNotification();

  const { mutateConversationAttachments } = useConversationAttachments({
    conversationId,
    owner,
    options: { disabled: true },
  });

  const [branchIdToApprove, setBranchIdToApprove] = useState<string | null>(
    null
  );

  const {
    conversation,
    conversationError,
    isConversationLoading,
    mutateConversation,
  } = useConversation({
    conversationId,
    workspaceId: owner.sId,
  });

  const { spaceInfo } = useSpaceInfo({
    workspaceId: owner.sId,
    spaceId: conversation?.spaceId ?? "",
    disabled: !conversation?.spaceId,
  });

  const { markAsRead } = useConversationMarkAsRead({
    conversation,
    workspaceId: owner.sId,
  });

  const { askForPermission } = useEnableBrowserNotification();

  const shouldShowPushNotificationActivation = useMemo(() => {
    if (!conversation?.sId || !conversation.unread) {
      return false;
    }

    const delay = new Date().getTime() - conversation.updated;

    return delay > DELAY_BEFORE_SUGGESTING_PUSH_NOTIFICATION_ACTIVATION;
  }, [conversation?.sId, conversation?.unread, conversation?.updated]);

  useEffect(() => {
    if (shouldShowPushNotificationActivation) {
      void askForPermission();
    }
  }, [shouldShowPushNotificationActivation, askForPermission]);

  const { mutateConversations } = useConversations({ workspaceId: owner.sId });

  const {
    isLoadingInitialData,
    isMessagesLoading,
    isMessagesError,
    isValidating,
    messages,
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

  const submitMessage = useSubmitMessage({
    owner,
    user,
    conversationId,
  });
  const submitInFlightRef = useRef(false);

  const [initialListData, setInitialListData] = useState<
    VirtuosoMessage[] | undefined
  >(undefined);

  const [messageIdToScrollTo, setMessageIdToScrollTo] = useState<number | null>(
    null
  );

  // Setup the initial list data when the conversation is loaded.
  // biome-ignore lint/correctness/useExhaustiveDependencies: ignored using `--suppress`
  useEffect(() => {
    // We also wait in case of revalidation because otherwise we might use stale data from the swr cache.
    // Consider this scenario:
    // Load a conversation A, send a message, answer is streaming (streaming events have a short TTL).
    // Switch to conversation B, wait till A is done streaming, then switch back to A.
    // Without waiting for revalidation, we would use whatever data was in the swr cache and see the last message as "streaming" (old data, no more streaming events).
    if (!initialListData && messages.length > 0 && !isValidating) {
      const raw = messages.flatMap((m) => m.messages);

      const messagesToRender = convertLightMessageTypeToVirtuosoMessages(raw);

      setInitialListData(messagesToRender);

      // Fetch the message to scroll to from the URL hash.
      const hash = window.location.hash;
      // If we arrive on an unread conversation from a deep link, we scroll to the linked message.
      // This is useful when sharing a message link to someone else.
      if (hash && hash.startsWith("#")) {
        const messageId = hash.substring(1); // Remove the '#' prefix.
        if (!messageId) {
          return;
        }

        // Find the message index in the current data.
        const messageIndex = messagesToRender.findIndex(
          (m) => m.sId === messageId
        );

        if (messageIndex === -1) {
          // nothing found to scroll to.
          return;
        }
        setMessageIdToScrollTo(messageIndex);
      } else if (conversation?.unread) {
        const lastReadMs = conversation.lastReadMs;

        if (lastReadMs === null) {
          // Conversation has never been read, scroll to the beginning.
          return;
        }

        const firstUnreadIndex = findFirstUnreadMessageIndex(
          messagesToRender,
          lastReadMs
        );

        if (firstUnreadIndex === -1) {
          return;
        }

        setMessageIdToScrollTo(firstUnreadIndex);
      }
    }
  }, [
    initialListData,
    messages,
    setInitialListData,
    isValidating,
    conversation?.unread,
    conversation?.lastReadMs,
  ]);

  // Sync the virtuoso ref with the side panel context.
  const {
    data: panelData,
    currentPanel,
    setVirtuosoMsg,
  } = useConversationSidePanelContext();

  // The ConversationSidePanel is not a children of the VirtuosoMessageList, therefor it doesn't have access to the state easily.
  // This provide the msg to the "Agent Details" panel when it's open and keep it updated.
  // It's a workaround until we found a cleaner way to handle this.
  // Note: it's based on the "onRenderedDataChange" call so it means that if the message is not rendered, the panel won't be updated.
  // It's highly unlikely to happen (we render much more than the viewport and it would be surprising that the user scroll to another message) but it's something to keep in mind.
  const onRenderedDataChange = useCallback(
    (renderedData: VirtuosoMessage[]) => {
      if (currentPanel === "actions" && panelData) {
        const { messageId } = parseDataAsMessageIdAndActionId(panelData);
        if (!messageId) {
          return;
        }
        const message = renderedData
          .filter(isAgentMessageWithStreaming)
          .find((m) => m.sId === messageId);
        if (message) {
          setVirtuosoMsg(message);
        }
      }
    },
    [currentPanel, panelData, setVirtuosoMsg]
  );

  // This is to handle we just fetched more messages by scrolling up.
  useEffect(() => {
    // don't do anything until we have a first page of messages.
    if (!ref.current || !ref.current.data.get().length) {
      return;
    }

    // We use the messages ranks to know what is older and what is newer.
    const ranks = ref.current.data.get().map((m) => m.rank);

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
        data: ConversationEvents;
      } = JSON.parse(eventStr);
      const event = eventPayload.data;

      if (!eventIds.current.includes(eventPayload.eventId)) {
        eventIds.current.push(eventPayload.eventId);
        switch (event.type) {
          case "user_message_new":
            if (ref.current) {
              const userMessage = event.message;
              const predicate = getPredicateForRankAndBranch(userMessage);

              const exists = ref.current.data.find(predicate);

              if (!exists) {
                // Do not scroll if the message is from the current user.
                // Can happen with fake user messages (like handover messages).
                const scroll = userMessage.user?.sId !== user.sId;

                const currentData = ref.current.data.get();
                const offset = getBranchedInsertIndex(currentData, userMessage);

                if (offset < currentData.length) {
                  ref.current.data.insert([userMessage], offset, scroll);
                } else {
                  ref.current.data.append([userMessage], scroll);
                }
                // Using else if with the type guard just to please the type checker as we already know it's a user message from the predicate.
              } else if (isUserMessage(exists)) {
                // We only update if the version is greater or equals than the existing version.
                if (exists.version <= event.message.version) {
                  ref.current.data.map((m) =>
                    areSameRankAndBranch(m, userMessage) ? userMessage : m
                  );
                }
              }

              // Update the participants and the conversation list if the message is not from the current user.
              if (userMessage.user?.sId !== user.sId) {
                void mutateConversationParticipants(
                  async (participants) =>
                    getUpdatedParticipantsFromEvent(participants, event),
                  { revalidate: false }
                );

                void mutateConversations(
                  (currentData: ConversationWithoutContentType[] | undefined) =>
                    currentData?.map((c) =>
                      c.sId === conversationId
                        ? { ...c, hasError: false, unread: false }
                        : c
                    ),
                  { revalidate: false }
                );
              }
              void debouncedMarkAsRead(conversationId);

              if (userMessage.contentFragments.length > 0) {
                void mutateConversationAttachments();
              }
            }
            break;

          case "user_message_promoted":
            if (ref.current) {
              ref.current.data.map((m) =>
                isUserMessage(m) && m.sId === event.messageId
                  ? { ...m, visibility: "visible" }
                  : m
              );
            }
            break;

          case "agent_message_new":
            if (ref.current) {
              const agentMessage = makeInitialMessageStreamState(
                getLightAgentMessageFromAgentMessage(event.message)
              );

              // Replace the message in the exist list data, or append.
              const predicate = getPredicateForRankAndBranch(agentMessage);
              const exists = ref.current.data.find(predicate);

              if (exists) {
                ref.current.data.map((m) => (predicate(m) ? agentMessage : m));
              } else {
                const currentData = ref.current.data.get();
                const offset = getBranchedInsertIndex(
                  currentData,
                  agentMessage
                );

                if (offset < currentData.length) {
                  ref.current.data.insert([agentMessage], offset);
                } else {
                  ref.current.data.append([agentMessage]);
                }
              }

              if (agentMessage.branchId) {
                setBranchIdToApprove(agentMessage.branchId);
              }

              void mutateConversationParticipants(async (participants) =>
                getUpdatedParticipantsFromEvent(participants, event)
              );
            }
            break;

          case "conversation_title":
            void debouncedMarkAsRead(conversationId);
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
              (currentData: ConversationWithoutContentType[] | undefined) =>
                currentData?.map((c) =>
                  c.sId === conversationId ? { ...c, title: event.title } : c
                ),
              { revalidate: false }
            );

            break;
          case "agent_message_done":
            // Mark as read and do not mutate the list of convos in the sidebar to avoid useless network request.
            // Debounce the call as we might receive multiple events for the same conversation (as we replay the events).
            void debouncedMarkAsRead(event.conversationId);

            // Update the conversation hasError state in the local cache without making a network request.
            void mutateConversations(
              (currentData: ConversationWithoutContentType[] | undefined) =>
                currentData?.map((c) =>
                  c.sId === event.conversationId
                    ? { ...c, hasError: event.status === "error" }
                    : c
                ),
              { revalidate: false }
            );

            window.dispatchEvent(new AgentMessageCompletedEvent());
            void mutateConversationAttachments();
            break;
          default:
            ((t: never) => {
              logger.error({ event: t }, "Unknown event type");
            })(event);
        }
      }
    },
    [
      conversationId,
      debouncedMarkAsRead,
      mutateConversation,
      mutateConversationAttachments,
      mutateConversationParticipants,
      mutateConversations,
      user.sId,
    ]
  );

  useConversationEvents({
    owner,
    conversationId,
    onEvent: onEventCallback,
    isReadyToConsumeStream:
      !isConversationLoading && !isLoadingInitialData && messages.length !== 0,
  });

  const handleSubmit = useCallback(
    async (
      input: string,
      mentions: RichMention[],
      contentFragments: ContentFragmentsType
    ): Promise<Result<undefined, DustError>> => {
      if (!ref?.current) {
        return new Err({
          code: "internal_error",
          name: "NoRef",
          message: "No ref",
        });
      }

      if (submitInFlightRef.current) {
        return new Err({
          code: "internal_error",
          name: "AlreadySubmitting",
          message: "Already submitting",
        });
      }

      submitInFlightRef.current = true;

      try {
        const messageData = {
          input,
          mentions: mentions.map(toMentionType),
          contentFragments,
          clientSideMCPServerIds:
            clientSideMCPServerIds ??
            agentBuilderContext?.clientSideMCPServerIds,
          skipToolsValidation: agentBuilderContext?.skipToolsValidation,
        };

        const lastMessageRank = Math.max(
          ...ref.current.data.get().map((m) => m.rank)
        );

        let rank =
          lastMessageRank +
          // Content fragments are prepended as "message" in the conversation, before the user
          // message.  We need to account for their ranks as well.
          contentFragments.contentNodes.length +
          contentFragments.uploaded.length +
          // +1 for the user message
          1;

        const placeholderUserMsg: VirtuosoMessage =
          createPlaceholderUserMessage({
            input,
            mentions,
            user,
            branchId: null, // We can't know the branch id yet, it will be set when the message is created.
            rank,
            contentFragments,
          });

        // Skip placeholder agent messages if there's already a running agent in the conversation
        // (steering: the message will be pending, no new agent message is created until the running
        // one gracefully stops).
        const hasRunningAgent = ref.current.data
          .get()
          .some((m) => m.type === "agent_message" && m.status === "created");

        const placeholderAgentMessages: VirtuosoMessage[] = [];
        if (!hasRunningAgent) {
          for (const mention of mentions) {
            if (isRichAgentMention(mention)) {
              // +1 per agent message mentioned
              rank += 1;
              placeholderAgentMessages.push(
                createPlaceholderAgentMessage({
                  userMessage: placeholderUserMsg,
                  mention,
                  rank,
                  branchId: null, // We can't know the branch id yet, it will be set when the message is created.
                })
              );
            }
          }
        }

        // An agent will answer immediately only if it is explicitely mentioned.
        // In that case, we want to scroll to put the user message at the top.
        const isMentioningAgent = mentions.some(isRichAgentMention);

        const nbMessages = ref.current.data.get().length;
        ref.current.data.append(
          [placeholderUserMsg, ...placeholderAgentMessages],
          isMentioningAgent
            ? false // Skip append-time scroll; handled by scrollToItem below.
            : (params) => {
                if (params.scrollLocation.bottomOffset >= 0) {
                  return {
                    index: "LAST",
                    align: "end",
                    behavior: customSmoothScroll,
                  };
                } else {
                  return false;
                }
              }
        );

        // Scroll the new user message to the top of the viewport.
        // We use scrollToItem instead of the append callback because
        // Virtuoso's append callback clamps the scroll target before applying
        // the bottom padding needed for align:"start" near the end of the
        // list, causing the scroll to undershoot.
        if (isMentioningAgent && ref.current) {
          ref.current.scrollToItem({
            index: nbMessages,
            align: "start",
            behavior: customSmoothScroll,
          });
        }

        const result = await submitMessage(messageData);

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
          logger.error({ err: result.error }, "Failed to post message");
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

        // If the message was created in a branch, we remove the placeholder user message and the placeholder agent messages from the list.
        if (messageFromBackend.branchId) {
          const placeHolderSids = [
            placeholderUserMsg.sId,
            ...placeholderAgentMessages.map((m) => m.sId),
          ];
          ref.current.data.findAndDelete((m) =>
            placeHolderSids.includes(m.sId)
          );
        }

        // map() is how we update the state of virtuoso messages.
        ref.current.data.map((m) =>
          areSameRankAndBranch(m, placeholderUserMsg)
            ? {
                ...messageFromBackend,
                contentFragments: contentFragmentsFromBackend,
              }
            : m
        );

        void mutateConversations(
          (currentData: ConversationWithoutContentType[] | undefined) =>
            currentData?.map((c) =>
              c.sId === conversationId
                ? { ...c, updated: new Date().getTime() }
                : c
            ),
          { revalidate: false }
        );

        return new Ok(undefined);
      } finally {
        submitInFlightRef.current = false;
      }
    },
    [
      agentBuilderContext?.clientSideMCPServerIds,
      clientSideMCPServerIds,
      agentBuilderContext?.skipToolsValidation,
      conversationId,
      mutateConversations,
      sendNotification,
      setPlanLimitReached,
      submitMessage,
      user,
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
      return `conversation-${context.conversation?.sId}-message-rank-${data.rank}-message-branchId-${data.branchId}`;
    },
    []
  );

  const itemIdentity = useCallback((item: VirtuosoMessage) => {
    return `message-rank-${item.rank}-message-branchId-${item.branchId}`;
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

  const isProjectMember = conversation?.spaceId
    ? (spaceInfo?.isMember ?? false) // Default false while loading (restrictive)
    : undefined;

  // After reversal in the hook, messages[0] is the oldest page. This only
  // returns the actual first conversation message when all pages are loaded
  // (works for onboarding conversations which are short / single-page).
  const firstMessage = messages.at(-1)?.messages.at(0);
  const isOnboardingConversation =
    !!firstMessage &&
    isUserMessageTypeWithContentFragments(firstMessage) &&
    firstMessage.context.origin === "onboarding_conversation";

  const context: VirtuosoMessageListContext = useMemo(() => {
    return {
      user,
      owner,
      handleSubmit,
      conversation,
      isOnboardingConversation,
      draftKey: `conversation-${conversationId}`,
      agentBuilderContext,
      feedbacksByMessageId,
      additionalMarkdownComponents,
      additionalMarkdownPlugins,
      isProjectMember,
      isProjectRestricted: spaceInfo?.isRestricted,
      projectId: conversation?.spaceId ?? undefined,
      projectSpaceName: spaceInfo?.name,
      branchIdToApprove: branchIdToApprove ?? undefined,
      setBranchIdToApprove,
    };
  }, [
    user,
    owner,
    handleSubmit,
    conversation,
    isOnboardingConversation,
    conversationId,
    agentBuilderContext,
    feedbacksByMessageId,
    additionalMarkdownComponents,
    additionalMarkdownPlugins,
    isProjectMember,
    spaceInfo?.isRestricted,
    spaceInfo?.name,
    branchIdToApprove,
  ]);

  return (
    <>
      {(conversationError || isMessagesError) && (
        <ConversationErrorDisplay
          error={conversationError || isMessagesError}
        />
      )}
      <VirtuosoMessageListLicense
        licenseKey={process.env.NEXT_PUBLIC_VIRTUOSO_LICENSE_KEY ?? ""}
      >
        <VirtuosoMessageList<VirtuosoMessage, VirtuosoMessageListContext>
          onRenderedDataChange={onRenderedDataChange}
          StickyHeader={ConversationBranchApprovalModal}
          data={{
            data: initialListData,
            scrollModifier: {
              type: "item-location",
              location: {
                index: messageIdToScrollTo ?? "LAST",
                align: messageIdToScrollTo ? "start" : "end",
                behavior: "instant",
              },
              purgeItemSizes: true,
            },
          }}
          ref={ref}
          ItemContent={MessageItem}
          StickyFooter={AgentInputBar}
          // Note: do NOT put any verticalpadding here as it will mess with the auto scroll to bottom.
          className={cn(
            "dd-privacy-mask",
            "@container/conversation",
            "h-full w-full px-5",
            !agentBuilderContext && "md:px-8"
          )}
          shortSizeAlign="top"
          computeItemKey={computeItemKey}
          onScroll={onScroll}
          context={context}
          itemIdentity={itemIdentity}
          EmptyPlaceholder={ConversationViewerEmptyState}
          // Large buffer to avoid manipulating the dom too much when the user scrolls a bit.
          increaseViewportBy={8192}
          enforceStickyFooterAtBottom
        />
      </VirtuosoMessageListLicense>
    </>
  );
};
