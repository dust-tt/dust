import type { WorkspaceLimit } from "@app/components/app/ReachedLimitPopup";
import { ConversationViewerEmptyState } from "@app/components/assistant/ConversationViewerEmptyState";
import { AgentInputBar } from "@app/components/assistant/conversation/AgentInputBar";
import { ConversationBranchApprovalModal } from "@app/components/assistant/conversation/ConversationBranchApprovalModal";
import { ConversationErrorDisplay } from "@app/components/assistant/conversation/ConversationError";
import {
  parseDataAsMessageIdAndActionId,
  useConversationSidePanelContext,
} from "@app/components/assistant/conversation/ConversationSidePanelContext";
import { useGenerationContext } from "@app/components/assistant/conversation/GenerationContextProvider";
import {
  InputBarContext,
  type PendingConversationMessage,
} from "@app/components/assistant/conversation/input_bar/InputBarContext";
import {
  createPlaceholderAgentMessage,
  createPlaceholderUserMessage,
} from "@app/components/assistant/conversation/lib";
import { MessageItem } from "@app/components/assistant/conversation/MessageItem";
import type {
  ConversationForkNotice,
  VirtuosoMessage,
  VirtuosoMessageListContext,
} from "@app/components/assistant/conversation/types";
import {
  areSameRankAndBranch,
  convertLightMessageTypeToVirtuosoMessages,
  getPredicateForRankAndBranch,
  isAgentMessageWithStreaming,
  isAtInitialStreamState,
  isCompactionMessage,
  isConversationForkNotice,
  isUserMessage,
  makeInitialMessageStreamState,
} from "@app/components/assistant/conversation/types";
import {
  useConversation,
  useConversationContextUsage,
  useConversationFeedbacks,
  useConversationMarkAsRead,
  useConversationMessages,
  useConversationParticipants,
  useConversations,
} from "@app/hooks/conversations";
import { useConversationAttachments } from "@app/hooks/conversations/useConversationAttachments";
import { useOpenConversationBranch } from "@app/hooks/conversations/useOpenConversationBranch";
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
import { useSpaceInfo } from "@app/lib/swr/spaces";
import logger from "@app/logger/logger";
import {
  type ConversationForkedChildType,
  type ConversationListItemType,
  isLightAgentMessageType,
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
import { findFirstUnreadMessageIndex } from "./utils";

const DEFAULT_PAGE_LIMIT = 50;

// A conversation must be unread and older than that to enable the suggestion of enabling notifications.
const DELAY_BEFORE_SUGGESTING_PUSH_NOTIFICATION_ACTIVATION = 60 * 60 * 1000; // 1 hour

interface ConversationViewerProps {
  conversationId: string;
  agentBuilderContext?: VirtuosoMessageListContext["agentBuilderContext"];
  additionalMarkdownComponents?: Components;
  additionalMarkdownPlugins?: PluggableList;
  setLimitReachedCode?: (code: WorkspaceLimit) => void;
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

function makeConversationForkNoticeMessage(
  sourceMessage: VirtuosoMessage,
  forkedChild: ConversationForkedChildType
): ConversationForkNotice {
  return {
    type: "conversation_fork_notice",
    sId: `conversation-fork-notice-${forkedChild.childConversationId}`,
    created: sourceMessage.created,
    rank: sourceMessage.rank,
    branchId: null,
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
  const { input, mentions, contentFragments } = pending;

  // Empty conversation: ranks start at 0 (no existing messages).
  let rank =
    contentFragments.contentNodes.length + contentFragments.uploaded.length;

  const userMessage = createPlaceholderUserMessage({
    input,
    mentions,
    user,
    branchId: null,
    rank,
    contentFragments,
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
          branchId: null,
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
  clientSideMCPServerIds,
}: ConversationViewerProps) => {
  const virtuosoMessageListRef =
    useRef<
      VirtuosoMessageListMethods<VirtuosoMessage, VirtuosoMessageListContext>
    >(null);
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

  const [branchIdToApprove, setBranchIdToApprove] = useState<string | null>(
    null
  );

  const { openBranch } = useOpenConversationBranch({ owner, conversationId });
  const hasInjectedOpenBranchRef = useRef(false);

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
    if (
      !initialListData &&
      conversation &&
      messages.length > 0 &&
      !isValidating
    ) {
      const raw = messages.flatMap((m) => m.messages);
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

  // Restore an open branch (and its messages) when the user reloads or
  // navigates back to a conversation that has a pending open branch. The
  // conversation fetch only returns the main thread, so without this the
  // approval modal would never re-open.
  useEffect(() => {
    if (
      !initialListData ||
      !openBranch ||
      !virtuosoMessageListRef.current ||
      hasInjectedOpenBranchRef.current
    ) {
      return;
    }
    hasInjectedOpenBranchRef.current = true;

    const branchMessages = convertLightMessageTypeToVirtuosoMessages(
      openBranch.messages
    );
    for (const msg of branchMessages) {
      const insertIdx = getBranchedInsertIndex(
        virtuosoMessageListRef.current.data.get(),
        msg
      );
      virtuosoMessageListRef.current.data.insert([msg], insertIdx);
    }
    setBranchIdToApprove(openBranch.branchId);
  }, [initialListData, openBranch]);

  // Sync the virtuoso ref with the side panel context.
  const {
    closePanel,
    data: panelData,
    currentPanel,
    openPanel,
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

  const debouncedMarkAsRead = useMemo(
    () => debounce(markAsRead, 2000),
    [markAsRead]
  );

  const eventIds = useRef<string[]>([]);

  // Last-seen plan.md version for this conversation. Used to auto-open the plan panel on the
  // skeleton-to-first-edit transition (v1 -> v2+). If the user lands on an already-populated
  // plan, no auto-open. ConversationViewer is keyed on conversationId by its parent, so the
  // ref is naturally reset on conversation switch via remount.
  const lastPlanVersionRef = useRef<number | undefined>(undefined);

  // `onEventCallback` is bound by `useConversationEvents` once at mount and does not re-subscribe
  // on identity changes (see useEventSource intentional behavior). Any state read from the
  // closure would go stale, so we mirror `currentPanel` into a ref.
  const currentPanelRef = useRef(currentPanel);
  useEffect(() => {
    currentPanelRef.current = currentPanel;
  }, [currentPanel]);

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
              const predicate = getPredicateForRankAndBranch(userMessage);

              const exists =
                virtuosoMessageListRef.current.data.find(predicate);

              if (!exists) {
                // Do not scroll if the message is from the current user.
                // Can happen with fake user messages (like handover messages).
                const scroll = userMessage.user?.sId !== user.sId;

                const currentData = virtuosoMessageListRef.current.data.get();
                const offset = getBranchedInsertIndex(currentData, userMessage);

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
                  (currentData: ConversationListItemType[] | undefined) =>
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
              const predicate = getPredicateForRankAndBranch(agentMessage);
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

                if (!shouldSkipReplace) {
                  virtuosoMessageListRef.current.data.map((m) =>
                    predicate(m) ? agentMessage : m
                  );
                }
              } else {
                const currentData = virtuosoMessageListRef.current.data.get();
                const offset = getBranchedInsertIndex(
                  currentData,
                  agentMessage
                );

                if (offset < currentData.length) {
                  virtuosoMessageListRef.current.data.insert(
                    [agentMessage],
                    offset
                  );
                } else {
                  virtuosoMessageListRef.current.data.append([agentMessage]);
                }
              }

              if (agentMessage.branchId) {
                setBranchIdToApprove(agentMessage.branchId);
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
              (currentData: ConversationListItemType[] | undefined) =>
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

              // Note: costCredits is intentionally not patched here. It is
              // computed and persisted later, in the finalize activities, so it
              // is not on this event. The per-message and conversation totals are
              // read from the messages / credit-cost API and refresh on their
              // next SWR revalidation (e.g. when the cost menu opens).
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
          case "compaction_message_new":
            if (virtuosoMessageListRef.current) {
              const compactionMessage = event.message;
              const predicate = getPredicateForRankAndBranch(compactionMessage);
              const exists =
                virtuosoMessageListRef.current.data.find(predicate);

              if (!exists) {
                const currentData = virtuosoMessageListRef.current.data.get();
                const offset = getBranchedInsertIndex(
                  currentData,
                  compactionMessage
                );
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
            const prevVersion = lastPlanVersionRef.current;
            lastPlanVersionRef.current = event.version;
            if (event.isClosed && currentPanelRef.current === "plan") {
              closePanel();
            } else if (prevVersion === 1 && event.version >= 2) {
              openPanel({ type: "plan" });
            }
            void mutate(
              planFileKey({
                workspaceId: owner.sId,
                conversationId: event.conversationId,
              })
            );
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
      closePanel,
      conversationId,
      debouncedMarkAsRead,
      mutateContextUsage,
      mutateConversation,
      mutateConversationAttachments,
      mutateConversationParticipants,
      mutateConversations,
      mutateMessages,
      openPanel,
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
      initialListData !== undefined,
  });

  const handleSubmit = useCallback(
    async (
      input: string,
      mentions: RichMention[],
      contentFragments: ContentFragmentsType
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
          skipToolsValidation: agentBuilderContext?.skipToolsValidation,
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
            branchId: null, // We can't know the branch id yet, it will be set when the message is created.
            rank,
            contentFragments,
          });

        // Skip placeholder agent messages if there's already a running agent in the conversation
        // (steering: the message will be pending, no new agent message is created until the running
        // one gracefully stops).
        const hasRunningAgent = virtuosoMessageListRef.current.data
          .get()
          .some((m) => m.type === "agent_message" && m.status === "created");

        if (hasRunningAgent && conversationId) {
          incrementPendingSteeringCount(conversationId);
        }

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
          if (result.error.type === "plan_limit_reached_error") {
            setLimitReachedCode?.("message_limit");
          } else if (result.error.type === "credits_exhausted_error") {
            setLimitReachedCode?.("pool_credits_exhausted");
          } else if (result.error.type === "user_cap_reached_error") {
            setLimitReachedCode?.("user_credits_exhausted");
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
          virtuosoMessageListRef.current.data.findAndDelete((m) =>
            placeHolderSids.includes(m.sId)
          );
        }

        // map() is how we update the state of virtuoso messages.
        virtuosoMessageListRef.current.data.map((m) =>
          areSameRankAndBranch(m, placeholderUserMsg)
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
            m.status === "pending_project_membership"
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
      return `conversation-${context.conversation?.sId}-message-rank-${data.rank}-message-branchId-${data.branchId}`;
    },
    []
  );

  const itemIdentity = useCallback((item: VirtuosoMessage) => {
    if (isConversationForkNotice(item)) {
      return item.sId;
    }
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
      isProjectArchived: !!spaceInfo?.archivedAt,
      projectId: conversation?.spaceId ?? undefined,
      projectSpaceName: spaceInfo?.name,
      branchIdToApprove: branchIdToApprove ?? undefined,
      setBranchIdToApprove,
      isAutoScrollEnabledRef,
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
    spaceInfo?.archivedAt,
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
          ref={virtuosoMessageListRef}
          ItemContent={MessageItem}
          StickyFooter={AgentInputBar}
          // Note: do NOT put any verticalpadding here as it will mess with the auto scroll to bottom.
          className={cn(
            "dd-privacy-mask",
            "@container/conversation",
            "touch-pan-y",
            "overscroll-contain",
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
