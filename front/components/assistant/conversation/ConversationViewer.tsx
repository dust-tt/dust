import type { WorkspaceLimit } from "@app/components/app/ReachedLimitPopup";
import { getWorkspaceLimitForSubmitError } from "@app/components/app/ReachedLimitPopup";
import { ConversationViewerEmptyState } from "@app/components/assistant/ConversationViewerEmptyState";
import { AgentInputBar } from "@app/components/assistant/conversation/AgentInputBar";
import {
  parseDataAsMessageIdAndActionId,
  useConversationSidePanelContext,
} from "@app/components/assistant/conversation/ConversationSidePanelContext";
import { useGenerationContext } from "@app/components/assistant/conversation/GenerationContextProvider";
import type { PendingConversationMessage } from "@app/components/assistant/conversation/input_bar/InputBarContext";
import { InputBarContext } from "@app/components/assistant/conversation/input_bar/InputBarContext";
import {
  createPlaceholderAgentMessage,
  createPlaceholderUserMessage,
} from "@app/components/assistant/conversation/lib";
import { MessageItem } from "@app/components/assistant/conversation/MessageItem";
import { handlePlanUpdatedEvent } from "@app/components/assistant/conversation/plan_mode/handle_plan_updated";
import type {
  AgentMessageWithStreaming,
  ConversationForkNotice,
  VirtuosoMessage,
  VirtuosoMessageListContext,
} from "@app/components/assistant/conversation/types";
import {
  areSameRank,
  convertLightMessageTypeToVirtuosoMessages,
  getPredicateForRank,
  isAgentMessageWithStreaming,
  isAtInitialStreamState,
  isCompactionMessage,
  isConversationForkNotice,
  isPlaceholderMessage,
  isUserMessage,
  makeInitialMessageStreamState,
} from "@app/components/assistant/conversation/types";
import {
  requestConversationMarkAsRead,
  useConversation,
  useConversationContextUsage,
  useConversationFeedbacks,
  useConversationMarkAsRead,
  useConversationMessages,
  useConversationParticipants,
  useConversations,
} from "@app/hooks/conversations";
import { useConversationAttachments } from "@app/hooks/conversations/useConversationAttachments";
import { planFileKey } from "@app/hooks/conversations/usePlanFile";
import { useConversationEvents } from "@app/hooks/useConversationEvents";
import { useEnableBrowserNotification } from "@app/hooks/useEnableBrowserNotification";
import { useSendNotification } from "@app/hooks/useNotification";
import { useSubmitMessage } from "@app/hooks/useSubmitMessage";
import { getLightAgentMessageFromAgentMessage } from "@app/lib/api/assistant/citations";
import type { AgentMessageFeedbackType } from "@app/lib/api/assistant/feedback";
import type { ConversationEvents } from "@app/lib/api/assistant/streaming/types";
import { getUpdatedParticipantsFromEvent } from "@app/lib/client/conversation/event_handlers";
import type { DustError } from "@app/lib/error";
import {
  AgentMessageCompletedEvent,
  CompactionCompletedEvent,
  CompactionStartedEvent,
} from "@app/lib/notifications/events";
import { useActivationPod } from "@app/lib/swr/activation";
import { useSpaceInfo } from "@app/lib/swr/spaces";
import { useIsMobile } from "@app/lib/swr/useIsMobile";
import { useConversationWakeUps } from "@app/lib/swr/wakeups";
import { getNextWakeUpFireAtFromScheduleConfig } from "@app/lib/utils/wakeup_description";
import logger from "@app/logger/logger";
import type { GetConversationPlanModeResponseBody } from "@app/types/api/assistant/plan_mode";
import type {
  ConversationForkedChildType,
  ConversationListItemType,
} from "@app/types/assistant/conversation";
import {
  isLightAgentMessageType,
  isUserMessageTypeWithContentFragments,
} from "@app/types/assistant/conversation";
import type { RichMention } from "@app/types/assistant/mentions";
import {
  isRichAgentMention,
  toMentionType,
} from "@app/types/assistant/mentions";
import type { ModelSelectionType } from "@app/types/assistant/models/types";
import { isActiveWakeUp } from "@app/types/assistant/wakeups";
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
import type { MutableRefObject } from "react";
import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { Components } from "react-markdown";
import type { PluggableList } from "react-markdown/lib/react-markdown";
import { mutate } from "swr";
import { ConversationErrorDisplay } from "./ConversationError";
import { findFirstUnreadMessageIndex } from "./utils";

const DEFAULT_PAGE_LIMIT = 50;
// SSE is the fast path; poll slowly in case the completion event is missed before subscription.
const FORK_PREPARATION_POLL_INTERVAL_MS = 60_000;

// A conversation must be unread and older than that to enable the suggestion of enabling notifications.
const DELAY_BEFORE_SUGGESTING_PUSH_NOTIFICATION_ACTIVATION = 60 * 60 * 1000; // 1 hour

interface ConversationViewerProps {
  conversationId: string;
  agentBuilderContext?: VirtuosoMessageListContext["agentBuilderContext"];
  additionalMarkdownComponents?: Components;
  additionalMarkdownPlugins?: PluggableList;
  setLimitReachedCode?: (code: WorkspaceLimit) => void;
  limitReachedCode?: WorkspaceLimit | null;
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

// This function is used to update the auto scroll enabled state based on the scroll location.
// Goal is to detect when the user is scrolling manually to pause the auto scroll.
function updateAutoScrollEnabledFromLocation({
  isAutoScrollEnabledRef,
  location,
  prevLocationRef,
}: {
  isAutoScrollEnabledRef: MutableRefObject<boolean>;
  location: Pick<ListScrollLocation, "scrollHeight" | "bottomOffset">;
  prevLocationRef: MutableRefObject<
    Pick<ListScrollLocation, "scrollHeight" | "bottomOffset">
  >;
}) {
  const { scrollHeight, bottomOffset } = location;
  const prev = prevLocationRef.current;

  // Scroll up with out change in content.
  if (scrollHeight === prev.scrollHeight && bottomOffset > prev.bottomOffset) {
    isAutoScrollEnabledRef.current = false;
  }

  // Scroll to bottom with no change in content.
  if (scrollHeight === prev.scrollHeight && bottomOffset == 0) {
    isAutoScrollEnabledRef.current = true;
  }

  prevLocationRef.current = { scrollHeight, bottomOffset };
}

function makeConversationForkNoticeMessage(
  sourceMessage: VirtuosoMessage,
  forkedChild: ConversationForkedChildType
): ConversationForkNotice {
  return {
    type: "conversation_fork_notice",
    sId: `conversation-fork-notice-${forkedChild.childConversationId}`,
    created: sourceMessage.created,
    rank: sourceMessage.rank,
    visibility: "visible",
    sourceMessageId: forkedChild.sourceMessageId,
    childConversationId: forkedChild.childConversationId,
    childConversationTitle: forkedChild.childConversationTitle,
    user: forkedChild.user,
  };
}

function addConversationForkNotices(
  messages: VirtuosoMessage[],
  forkedChildren: ConversationForkedChildType[] = []
): VirtuosoMessage[] {
  const renderedMessages = messages.filter(
    (message) => !isConversationForkNotice(message)
  );

  if (forkedChildren.length === 0) {
    return renderedMessages;
  }

  const forkedChildrenBySourceMessageId = new Map<
    string,
    ConversationForkedChildType[]
  >();

  for (const forkedChild of forkedChildren) {
    const currentChildren =
      forkedChildrenBySourceMessageId.get(forkedChild.sourceMessageId) ?? [];
    forkedChildrenBySourceMessageId.set(forkedChild.sourceMessageId, [
      ...currentChildren,
      forkedChild,
    ]);
  }

  const mergedMessages: VirtuosoMessage[] = [];

  for (const message of renderedMessages) {
    mergedMessages.push(message);

    if (!isAgentMessageWithStreaming(message)) {
      continue;
    }

    const forkedChildrenForMessage = [
      ...(forkedChildrenBySourceMessageId.get(message.sId) ?? []),
    ].sort((a, b) => a.branchedAt - b.branchedAt);

    mergedMessages.push(
      ...forkedChildrenForMessage.map((forkedChild) =>
        makeConversationForkNoticeMessage(message, forkedChild)
      )
    );
  }

  return mergedMessages;
}

interface FirstMessagePlaceholders {
  userMessage: VirtuosoMessage;
  agentMessages: VirtuosoMessage[];
}

// Builds the optimistic placeholders for the very first message of a
// freshly-created conversation, so the list can mount non-empty.
function buildFirstMessagePlaceholders(
  pending: PendingConversationMessage,
  user: UserType
): FirstMessagePlaceholders {
  const { input, mentions, contentFragments, modelSelection } = pending;

  // Empty conversation: ranks start at 0 (no existing messages).
  let rank =
    contentFragments.contentNodes.length + contentFragments.uploaded.length;

  const userMessage = createPlaceholderUserMessage({
    input,
    mentions,
    user,
    rank,
    contentFragments,
    requestedModel: modelSelection ?? null,
  });

  const agentMessages: VirtuosoMessage[] = [];
  for (const mention of mentions) {
    if (isRichAgentMention(mention)) {
      rank += 1;
      agentMessages.push(
        createPlaceholderAgentMessage({
          userMessage,
          mention,
          rank,
        })
      );
    }
  }

  return { userMessage, agentMessages };
}

export const ConversationViewer = ({
  owner,
  user,
  conversationId,
  agentBuilderContext,
  additionalMarkdownComponents,
  additionalMarkdownPlugins,
  setLimitReachedCode,
  limitReachedCode,
  clientSideMCPServerIds,
}: ConversationViewerProps) => {
  const virtuosoMessageListRef =
    useRef<
      VirtuosoMessageListMethods<VirtuosoMessage, VirtuosoMessageListContext>
    >(null);
  const isMobile = useIsMobile();
  const isAutoScrollEnabledRef = useRef(true);
  const prevScrollLocationRef = useRef({
    scrollHeight: 0,
    bottomOffset: 0,
  });
  const sendNotification = useSendNotification();
  const { incrementPendingSteeringCount } = useGenerationContext();
  const { peekPendingFirstMessage } = useContext(InputBarContext);

  const { mutateConversationAttachments } = useConversationAttachments({
    conversationId,
    owner,
    options: { disabled: true },
  });

  const {
    conversation,
    conversationError,
    isConversationLoading,
    mutateConversation,
  } = useConversation({
    conversationId,
    workspaceId: owner.sId,
    options: {
      refreshInterval: (data) =>
        data?.conversation.forkingData?.forkedFrom?.fileCopyStatus === "pending"
          ? FORK_PREPARATION_POLL_INTERVAL_MS
          : 0,
    },
  });

  const { spaceInfo } = useSpaceInfo({
    workspaceId: owner.sId,
    spaceId: conversation?.spaceId ?? "",
    disabled: !conversation?.spaceId,
  });

  const { activationPodId } = useActivationPod({
    workspaceId: owner.sId,
  });

  useConversationMarkAsRead({
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

  const { mutateConversations } = useConversations({
    workspaceId: owner.sId,
    options: { disabled: true },
  });

  const {
    isLoadingInitialData,
    isMessagesLoading,
    isMessagesError,
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

  const { mutateWakeUps } = useConversationWakeUps({
    owner,
    conversationId,
    disabled: true, // We don't fetch here, only patch the cache on wake_up_updated events.
  });

  const { mutateContextUsage } = useConversationContextUsage({
    conversationId,
    workspaceId: owner.sId,
    options: { disabled: true },
  });

  const submitMessage = useSubmitMessage({
    owner,
    user,
    conversationId,
  });
  const submitInFlightRef = useRef(false);

  // Pending first message for a freshly-created conversation (deferred-send flow).
  // Read from InputBarContext (survives Strict Mode remounts) and seeded as the
  // initial (non-empty) list data so the message shows instantly. The actual send
  // is handled by useCreateConversationWithMessage; this is display-only.
  const pendingFirstMessageRef = useRef<
    PendingConversationMessage | null | undefined
  >(undefined);
  if (pendingFirstMessageRef.current === undefined) {
    pendingFirstMessageRef.current = peekPendingFirstMessage(conversationId);
  }
  const firstMessagePlaceholdersRef = useRef<FirstMessagePlaceholders | null>(
    null
  );
  if (
    pendingFirstMessageRef.current &&
    firstMessagePlaceholdersRef.current === null
  ) {
    firstMessagePlaceholdersRef.current = buildFirstMessagePlaceholders(
      pendingFirstMessageRef.current,
      user
    );
  }

  const [initialListData, setInitialListData] = useState<
    VirtuosoMessage[] | undefined
  >(() =>
    firstMessagePlaceholdersRef.current
      ? [
          firstMessagePlaceholdersRef.current.userMessage,
          ...firstMessagePlaceholdersRef.current.agentMessages,
        ]
      : undefined
  );

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
    if (initialListData === undefined && conversation && !isValidating) {
      const raw = messages.flatMap((m) => m.messages);
      if (raw.length === 0) {
        return;
      }

      const messagesToRender = convertLightMessageTypeToVirtuosoMessages(raw);
      const messagesAndNotices = addConversationForkNotices(
        messagesToRender,
        conversation.forkingData?.forkedChildren
      );

      setInitialListData(messagesAndNotices);

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
        const messageIndex = messagesAndNotices.findIndex(
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
          messagesAndNotices,
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
    conversation,
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
    if (
      !virtuosoMessageListRef.current ||
      !virtuosoMessageListRef.current.data.get().length
    ) {
      return;
    }

    // We use the messages ranks to know what is older and what is newer.
    const ranks = virtuosoMessageListRef.current.data.get().map((m) => m.rank);

    const minRank = Math.min(...ranks);

    const messagesFromBackend = messages.flatMap((m) => m.messages);

    const olderMessagesFromBackend = messagesFromBackend.filter(
      (m) => m.rank < minRank
    );

    if (olderMessagesFromBackend.length > 0) {
      const renderedOlderMessages = convertLightMessageTypeToVirtuosoMessages(
        olderMessagesFromBackend
      );
      virtuosoMessageListRef.current.data.prepend(
        addConversationForkNotices(
          renderedOlderMessages,
          conversation?.forkingData?.forkedChildren
        )
      );
    }

    const maxRank = Math.max(...ranks);

    const recentMessagesFromBackend = messagesFromBackend.filter(
      (m) => m.rank > maxRank
    );

    if (recentMessagesFromBackend.length > 0) {
      const renderedRecentMessages = convertLightMessageTypeToVirtuosoMessages(
        recentMessagesFromBackend
      );
      virtuosoMessageListRef.current.data.append(
        addConversationForkNotices(
          renderedRecentMessages,
          conversation?.forkingData?.forkedChildren
        )
      );
    }
  }, [conversation?.forkingData?.forkedChildren, messages]);

  useEffect(() => {
    if (
      !virtuosoMessageListRef.current ||
      !virtuosoMessageListRef.current.data.get().length
    ) {
      return;
    }

    const currentData = virtuosoMessageListRef.current.data.get();
    const reconciledData = addConversationForkNotices(
      currentData,
      conversation?.forkingData?.forkedChildren
    );

    if (
      currentData.length === reconciledData.length &&
      currentData.every(
        (message, index) => message.sId === reconciledData[index]?.sId
      )
    ) {
      return;
    }

    while (
      virtuosoMessageListRef.current.data.get().some(isConversationForkNotice)
    ) {
      virtuosoMessageListRef.current.data.findAndDelete((message) =>
        isConversationForkNotice(message)
      );
    }

    let index = 0;

    for (const message of reconciledData) {
      if (isConversationForkNotice(message)) {
        virtuosoMessageListRef.current.data.insert([message], index);
      }
      index += 1;
    }
  }, [conversation?.forkingData?.forkedChildren]);

  const { feedbacks } = useConversationFeedbacks({
    conversationId: conversationId ?? "",
    workspaceId: owner.sId,
  });

  // Hooks related to conversation events streaming.

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
            if (virtuosoMessageListRef.current) {
              const userMessage = event.message;
              const predicate = getPredicateForRank(userMessage);

              // Drop a leftover agent placeholder occupying this rank so it
              // cannot swallow the update. The user's own optimistic
              // placeholder must NOT be deleted here: it is replaced in place
              // below, and delete+insert breaks Virtuoso's rank-based row
              // identity, making subsequent rows overlap.
              virtuosoMessageListRef.current.data.findAndDelete(
                (m) =>
                  predicate(m) && isPlaceholderMessage(m) && !isUserMessage(m)
              );

              const exists =
                virtuosoMessageListRef.current.data.find(predicate);

              if (!exists) {
                // Do not scroll if the message is from the current user.
                // Can happen with fake user messages (like handover messages).
                const scroll = userMessage.user?.sId !== user.sId;

                const currentData = virtuosoMessageListRef.current.data.get();

                // Insert before the first message with a strictly greater rank, or append if none.
                let offset = currentData.findIndex(
                  (m) => m.rank > userMessage.rank
                );
                offset = offset === -1 ? currentData.length : offset;

                if (offset < currentData.length) {
                  virtuosoMessageListRef.current.data.insert(
                    [userMessage],
                    offset,
                    scroll
                  );
                } else {
                  virtuosoMessageListRef.current.data.append(
                    [userMessage],
                    scroll
                  );
                }
                // Using else if with the type guard just to please the type checker as we already know it's a user message from the predicate.
              } else if (isUserMessage(exists)) {
                // We only update if the version is greater or equals than the existing version.
                if (exists.version <= event.message.version) {
                  virtuosoMessageListRef.current.data.map((m) =>
                    areSameRank(m, userMessage) ? userMessage : m
                  );
                }
              } else {
                // Same rank occupied by a real non-user message — fall back to
                // sId so mention status still lands on the correct user row.
                const bySId = virtuosoMessageListRef.current.data.find(
                  (m) => isUserMessage(m) && m.sId === userMessage.sId
                );
                if (
                  bySId &&
                  isUserMessage(bySId) &&
                  bySId.version <= userMessage.version
                ) {
                  virtuosoMessageListRef.current.data.map((m) =>
                    m.sId === userMessage.sId ? userMessage : m
                  );
                }
              }

              // Restricted agents never emit agent_message_new. Drop their
              // optimistic placeholders (including deferred first-message ones)
              // so they cannot collide on rank or look like a running agent.
              const restrictedAgentIds = new Set(
                userMessage.richMentions
                  .filter(
                    (m) =>
                      isRichAgentMention(m) &&
                      m.status === "agent_restricted_by_space_usage"
                  )
                  .map((m) => m.id)
              );
              if (restrictedAgentIds.size > 0) {
                virtuosoMessageListRef.current.data.findAndDelete(
                  (m) =>
                    isPlaceholderMessage(m) &&
                    isAgentMessageWithStreaming(m) &&
                    restrictedAgentIds.has(m.configuration.sId)
                );
              }

              // Update the participants and the conversation list if the message is not from the current user.
              if (userMessage.user?.sId !== user.sId) {
                void mutateConversationParticipants(
                  async (participants) =>
                    getUpdatedParticipantsFromEvent(participants, event),
                  { revalidate: false }
                );

                void mutateConversations(
                  (currentData: ConversationListItemType[] | undefined) =>
                    currentData?.map((c) =>
                      c.sId === conversationId
                        ? { ...c, hasError: false, unread: false }
                        : c
                    ),
                  { revalidate: false }
                );
              }
              requestConversationMarkAsRead({
                workspaceId: owner.sId,
                conversationId,
                activityAtMs: event.created,
              });

              if (userMessage.contentFragments.length > 0) {
                void mutateConversationAttachments();
              }
            }
            break;

          case "user_message_promoted":
            if (virtuosoMessageListRef.current) {
              virtuosoMessageListRef.current.data.map((m) =>
                isUserMessage(m) && m.sId === event.messageId
                  ? { ...m, visibility: "visible" }
                  : m
              );
            }
            break;

          case "agent_message_new":
            if (virtuosoMessageListRef.current) {
              const agentMessage = makeInitialMessageStreamState(
                getLightAgentMessageFromAgentMessage(event.message)
              );

              // Replace the message in the exist list data, or append.
              const predicate = getPredicateForRank(agentMessage);
              const exists =
                virtuosoMessageListRef.current.data.find(predicate);

              if (exists) {
                // Guard against conversation SSE replays overwriting a message
                // that the message-level SSE has already partially or fully
                // streamed.
                //
                // Two independent SSE streams feed each message:
                //   1. Conversation stream — carries agent_message_new (structural events)
                //   2. Message stream      — carries generation_tokens, tool_* (content events)
                //
                // When the conversation stream drops and reconnects, the server
                // replays agent_message_new with the message's original "created"
                // payload: null content, agentState = "thinking", empty steps.
                // Replacing the Virtuoso entry with that stale payload would wipe
                // whatever the message stream already delivered, so we skip the
                // replace when the existing entry is the same logical message
                // (same sId) and has already progressed past its initial state.
                //
                // Retries carry a new sId at the same rank/branch, so they
                // always fall through to the replace path.
                const shouldSkipReplace =
                  isAgentMessageWithStreaming(exists) &&
                  exists.sId === agentMessage.sId &&
                  !isAtInitialStreamState(exists);

                if (shouldSkipReplace && agentMessage.richMentions.length > 0) {
                  // User mentions are resolved after the agent finishes and
                  // arrive through a second agent_message_new event. Keep the
                  // streamed message state, but apply the resolved mentions.
                  virtuosoMessageListRef.current.data.map((m) =>
                    isAgentMessageWithStreaming(m) && m.sId === agentMessage.sId
                      ? { ...m, richMentions: agentMessage.richMentions }
                      : m
                  );
                } else if (!shouldSkipReplace) {
                  virtuosoMessageListRef.current.data.map((m) =>
                    predicate(m) ? agentMessage : m
                  );
                }
              } else {
                const currentData = virtuosoMessageListRef.current.data.get();
                // Insert before the first message with a strictly greater rank, or append if none.
                let offset = currentData.findIndex(
                  (m) => m.rank > agentMessage.rank
                );
                offset = offset === -1 ? currentData.length : offset;

                if (offset < currentData.length) {
                  virtuosoMessageListRef.current.data.insert(
                    [agentMessage],
                    offset
                  );
                } else {
                  virtuosoMessageListRef.current.data.append([agentMessage]);
                }
              }

              void mutateConversationParticipants(async (participants) =>
                getUpdatedParticipantsFromEvent(participants, event)
              );

              void mutateConversations(
                (currentData: ConversationListItemType[] | undefined) =>
                  currentData?.map((c) =>
                    c.sId === conversationId
                      ? { ...c, isRunningAgentLoop: true }
                      : c
                  ),
                { revalidate: false }
              );
            }
            break;

          case "conversation_title":
            requestConversationMarkAsRead({
              workspaceId: owner.sId,
              conversationId,
              activityAtMs: event.created,
            });
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
              (currentData: ConversationListItemType[] | undefined) =>
                currentData?.map((c) =>
                  c.sId === conversationId ? { ...c, title: event.title } : c
                ),
              { revalidate: false }
            );

            break;
          case "conversation_fork_prepared":
            if (
              conversation?.forkingData?.forkedFrom?.fileCopyStatus ===
              "pending"
            ) {
              void mutateConversation();
            }
            break;
          case "agent_message_done":
            requestConversationMarkAsRead({
              workspaceId: owner.sId,
              conversationId: event.conversationId,
              activityAtMs: event.created,
            });

            // Re-fetch context usage after the agent finishes so the indicator is up-to-date.
            void mutateContextUsage();

            // Update the messages SWR cache in place so a future remount
            // (e.g. navigating away and back) sees the full terminal state.
            // The message-level SSE fires agent_message_success before this
            // conversation-level event, so Virtuoso already holds the final
            // content, completionDurationMs, and activitySteps. We copy them
            // into the SWR snapshot to avoid a blank message body on remount.
            // If Virtuoso hasn't committed the update yet (rare race between
            // two independent SSE streams), we fall back to a real revalidation.
            {
              const vMsg = virtuosoMessageListRef.current?.data.find(
                (m) => m.sId === event.messageId
              );
              const msg =
                vMsg && isAgentMessageWithStreaming(vMsg) ? vMsg : null;

              void mutateMessages(
                (pages) =>
                  pages?.map((page) => ({
                    ...page,
                    messages: page.messages.map((m) =>
                      isLightAgentMessageType(m) && m.sId === event.messageId
                        ? {
                            ...m,
                            status:
                              event.status === "error"
                                ? ("failed" as const)
                                : ("succeeded" as const),
                            ...(msg !== null
                              ? {
                                  content: msg.content,
                                  completionDurationMs:
                                    msg.completionDurationMs,
                                  activitySteps:
                                    msg.streaming.inlineActivitySteps,
                                }
                              : {}),
                          }
                        : m
                    ),
                  })),
                { revalidate: msg === null }
              );
            }

            // Update the conversation hasError state in the local cache without making a network request.
            void mutateConversations(
              (currentData: ConversationListItemType[] | undefined) =>
                currentData?.map((c) =>
                  c.sId === event.conversationId
                    ? {
                        ...c,
                        hasError: event.status === "error",
                        isRunningAgentLoop: false,
                      }
                    : c
                ),
              { revalidate: false }
            );

            window.dispatchEvent(new AgentMessageCompletedEvent());
            void mutateConversationAttachments();
            break;
          case "agent_message_consumption_updated":
            virtuosoMessageListRef.current?.data.map((message) =>
              isAgentMessageWithStreaming(message) &&
              message.sId === event.messageId
                ? { ...message, costCredits: event.costCredits }
                : message
            );
            void mutateMessages(
              (pages) =>
                pages?.map((page) => ({
                  ...page,
                  messages: page.messages.map((message) =>
                    isLightAgentMessageType(message) &&
                    message.sId === event.messageId
                      ? { ...message, costCredits: event.costCredits }
                      : message
                  ),
                })),
              { revalidate: false }
            );
            break;
          case "compaction_message_new":
            if (virtuosoMessageListRef.current) {
              const compactionMessage = event.message;
              const predicate = getPredicateForRank(compactionMessage);
              const exists =
                virtuosoMessageListRef.current.data.find(predicate);

              if (!exists) {
                const currentData = virtuosoMessageListRef.current.data.get();
                // Insert before the first message with a strictly greater rank, or append if none.
                let offset = currentData.findIndex(
                  (m) => m.rank > compactionMessage.rank
                );
                offset = offset === -1 ? currentData.length : offset;

                // Scroll to the bottom when the user compacts so the
                // compaction message is in view.
                const scrollToCompaction = () =>
                  ({
                    index: "LAST",
                    align: "end",
                    behavior: "smooth",
                  }) as const;
                if (offset < currentData.length) {
                  virtuosoMessageListRef.current.data.insert(
                    [compactionMessage],
                    offset,
                    scrollToCompaction
                  );
                } else {
                  virtuosoMessageListRef.current.data.append(
                    [compactionMessage],
                    scrollToCompaction
                  );
                }
              }
            }
            if (conversationId) {
              window.dispatchEvent(new CompactionStartedEvent(conversationId));
            }
            break;

          case "compaction_message_done":
            if (virtuosoMessageListRef.current) {
              const doneMessage = event.message;
              virtuosoMessageListRef.current.data.map((m) =>
                isCompactionMessage(m) && m.sId === event.messageId
                  ? doneMessage
                  : m
              );
            }
            void mutateContextUsage();
            window.dispatchEvent(new CompactionCompletedEvent());
            break;
          case "plan_updated": {
            // The acting client already updates via the per-message plan tool action; this handles
            // cross-client propagation (e.g. another viewer) and is a backstop. PlanPanelButton opens/closes
            // the panel in reaction to the content change.
            const planKey = planFileKey({
              workspaceId: owner.sId,
              conversationId: event.conversationId,
            });
            handlePlanUpdatedEvent(event, {
              // Close is authoritative: write null directly (no fetch, cannot reject).
              writeClosedToCache: () =>
                void mutate<GetConversationPlanModeResponseBody>(
                  planKey,
                  { content: null },
                  { revalidate: false }
                ),
              // SWR owns request ordering, so a revalidation that resolves after a later close is
              // discarded.
              revalidatePlan: () => void mutate(planKey),
            });
            break;
          }
          case "wake_up_updated": {
            // Refetch wake-ups, then sync the conversation list's nextWakeupAt. Only one wake-up
            // can be active per conversation, so the active one fully determines that value.
            void mutateWakeUps().then((updated) => {
              const active = updated?.wakeUps.find(isActiveWakeUp) ?? null;
              const nextWakeupAt = active
                ? getNextWakeUpFireAtFromScheduleConfig(active.scheduleConfig)
                : null;
              void mutateConversations(
                (currentData: ConversationListItemType[] | undefined) =>
                  currentData?.map((c) =>
                    c.sId === conversationId ? { ...c, nextWakeupAt } : c
                  ),
                { revalidate: false }
              );
            });
            break;
          }
          default:
            ((t: never) => {
              logger.error({ event: t }, "Unknown event type");
            })(event);
        }
      }
    },
    [
      conversation?.forkingData?.forkedFrom?.fileCopyStatus,
      conversationId,
      mutateContextUsage,
      mutateConversation,
      mutateConversationAttachments,
      mutateConversationParticipants,
      mutateConversations,
      mutateMessages,
      mutateWakeUps,
      owner.sId,
      user.sId,
    ]
  );

  useConversationEvents({
    owner,
    conversationId,
    onEvent: onEventCallback,
    // Also gate on initialListData being set: that only happens after the
    // Virtuoso init effect runs, which itself waits for !isValidating (fresh
    // SWR data). Without this gate, the conversation SSE starts as soon as
    // cached data exists (isLoadingInitialData = false) while Virtuoso is still
    // empty — so agent_message_new fires against an empty list, bypasses the
    // terminal-status guard, and re-opens the message-events stream.
    isReadyToConsumeStream:
      !isConversationLoading &&
      !isLoadingInitialData &&
      messages.length !== 0 &&
      initialListData !== undefined &&
      initialListData.length > 0,
  });

  const handleSubmit = useCallback(
    async (
      input: string,
      mentions: RichMention[],
      contentFragments: ContentFragmentsType,
      _selectedMCPServerViewIds?: string[],
      selectedSpaceIds?: string[],
      modelSelection?: ModelSelectionType
    ): Promise<Result<undefined, DustError>> => {
      if (!virtuosoMessageListRef?.current) {
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
          selectedSpaceIds,
          skipToolsValidation: agentBuilderContext?.skipToolsValidation,
          modelSelection,
        };

        const lastMessageRank = Math.max(
          ...virtuosoMessageListRef.current.data.get().map((m) => m.rank)
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
            rank,
            contentFragments,
            requestedModel: modelSelection ?? null,
          });

        // Skip placeholder agent messages if there's already a running agent in the conversation
        // (steering: the message will be pending, no new agent message is created until the running
        // one gracefully stops). Optimistic placeholders must not count — e.g. a leftover
        // restricted-agent placeholder from the deferred first message.
        const hasRunningAgent = virtuosoMessageListRef.current.data
          .get()
          .some(
            (m) =>
              m.type === "agent_message" &&
              m.status === "created" &&
              !isPlaceholderMessage(m)
          );

        if (hasRunningAgent && conversationId) {
          incrementPendingSteeringCount(conversationId);
        }

        const placeholderAgentMessages: AgentMessageWithStreaming[] = [];
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
                })
              );
            }
          }
        }

        // An agent will answer immediately only if it is explicitly mentioned.
        // In that case, we want to scroll to put the user message at the top.
        // But when steering (agent already running), don't auto-scroll — let the
        // user keep their current scroll position.
        const isMentioningAgent = mentions.some(isRichAgentMention);

        // When steering (hasRunningAgent), the message is pending and no new
        // agent message is created — stay at the current scroll position.
        const shouldScrollToUserMessage = isMentioningAgent && !hasRunningAgent;

        const nbMessages = virtuosoMessageListRef.current.data.get().length;
        virtuosoMessageListRef.current.data.append(
          [placeholderUserMsg, ...placeholderAgentMessages],
          shouldScrollToUserMessage
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

        // We use scrollToItem instead of the append callback because
        // Virtuoso's append callback clamps the scroll target before applying
        // the bottom padding needed for align:"start" near the end of the
        // list, causing the scroll to undershoot.
        if (shouldScrollToUserMessage && virtuosoMessageListRef.current) {
          virtuosoMessageListRef.current.scrollToItem({
            index: nbMessages,
            align: "start",
            behavior: customSmoothScroll,
          });
        }

        const result = await submitMessage(messageData);

        if (result.isErr()) {
          const limitCode = getWorkspaceLimitForSubmitError(result.error.type);
          if (limitCode) {
            setLimitReachedCode?.(limitCode);
          } else {
            sendNotification({
              title: result.error.title,
              description: result.error.message,
              type: "error",
            });
          }

          // Remove optimistic placeholders — SWR rolls back the server cache but
          // Virtuoso's in-memory list must be cleaned up manually.
          const failedPlaceholderSids = [
            placeholderUserMsg.sId,
            ...placeholderAgentMessages.map((m) => m.sId),
          ];
          virtuosoMessageListRef.current.data.findAndDelete((m) =>
            failedPlaceholderSids.includes(m.sId)
          );
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
          agentMessages: agentMessagesFromBackend,
        } = result.value;

        // Restricted / mention-only agents: backend returns no agent message
        // for that mention. Remove matching optimistic agent placeholders so
        // they cannot collide on rank with later real messages.
        const createdAgentConfigIds = new Set(
          agentMessagesFromBackend.map((m) => m.configuration.sId)
        );
        virtuosoMessageListRef.current.data.findAndDelete((m) =>
          placeholderAgentMessages.some(
            (p) =>
              p.sId === m.sId && !createdAgentConfigIds.has(p.configuration.sId)
          )
        );

        // Replace the optimistic user row by sId (not rank): FE lastMessageRank
        // can disagree with the DB when stale placeholders inflated the client rank.
        virtuosoMessageListRef.current.data.map((m) =>
          m.sId === placeholderUserMsg.sId
            ? {
                ...messageFromBackend,
                contentFragments: contentFragmentsFromBackend,
              }
            : m
        );

        // When there are pending user mentions, MentionValidationRequired
        // renders below the user message — scroll to the bottom so the action
        // card is visible.
        const hasPendingMentions = messageFromBackend.richMentions?.some(
          (m) =>
            m.status === "pending_conversation_access" ||
            m.status === "pending_project_membership" ||
            m.status === "agent_restricted_by_space_usage"
        );
        if (hasPendingMentions) {
          virtuosoMessageListRef.current.scrollToItem({
            index: "LAST",
            align: "end",
            behavior: customSmoothScroll,
          });
        }

        void mutateConversations(
          (currentData: ConversationListItemType[] | undefined) =>
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
      setLimitReachedCode,
      submitMessage,
      user,
      incrementPendingSteeringCount,
    ]
  );

  const onScroll = useCallback(
    (location: ListScrollLocation) => {
      updateAutoScrollEnabledFromLocation({
        isAutoScrollEnabledRef,
        location,
        prevLocationRef: prevScrollLocationRef,
      });

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
      if (isConversationForkNotice(data)) {
        return `conversation-${context.conversation?.sId}-${data.sId}`;
      }
      return `conversation-${context.conversation?.sId}-message-rank-${data.rank}`;
    },
    []
  );

  const itemIdentity = useCallback((item: VirtuosoMessage) => {
    if (isConversationForkNotice(item)) {
      return item.sId;
    }
    return `message-rank-${item.rank}-message`;
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
      uiView:
        conversation?.spaceId && conversation.spaceId === activationPodId
          ? "compact"
          : "standard",
      draftKey: `conversation-${conversationId}`,
      agentBuilderContext,
      feedbacksByMessageId,
      additionalMarkdownComponents,
      additionalMarkdownPlugins,
      isProjectMember,
      isProjectRestricted: spaceInfo?.isRestricted,
      isProjectArchived: !!spaceInfo?.archivedAt,
      projectId: conversation?.spaceId ?? undefined,
      projectSpaceName: spaceInfo?.name,
      isAutoScrollEnabledRef,
      isNoSeat: limitReachedCode === "no_seat",
      setLimitReachedCode,
    };
  }, [
    user,
    owner,
    handleSubmit,
    conversation,
    isOnboardingConversation,
    activationPodId,
    conversationId,
    agentBuilderContext,
    feedbacksByMessageId,
    additionalMarkdownComponents,
    additionalMarkdownPlugins,
    isProjectMember,
    spaceInfo?.isRestricted,
    spaceInfo?.archivedAt,
    spaceInfo?.name,
    limitReachedCode,
    setLimitReachedCode,
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
          useWindowScroll={isMobile}
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
          ref={virtuosoMessageListRef}
          ItemContent={MessageItem}
          StickyFooter={AgentInputBar}
          // Note: do NOT put any verticalpadding here as it will mess with the auto scroll to bottom.
          className={cn(
            "dd-privacy-mask",
            "@container/conversation",
            "touch-pan-y",
            "w-full px-5",
            !isMobile && "overscroll-contain h-full",
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
