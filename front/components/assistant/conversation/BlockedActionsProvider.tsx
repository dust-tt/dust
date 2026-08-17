import { useConversations } from "@app/hooks/conversations";
import type { AgentLoopBlockedToolExecution } from "@app/lib/actions/mcp";
import { canCurrentUserRespondToParentUserMessage } from "@app/lib/api/assistant/conversation/can_current_user_respond";
import { useBlockedActions } from "@app/lib/swr/blocked_actions";
import type { ConversationListItemType } from "@app/types/assistant/conversation";
import type { LightWorkspaceType } from "@app/types/user";
import type { ReactNode } from "react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

type BlockedActionQueueItem = {
  messageId: string;
  blockedAction: AgentLoopBlockedToolExecution;
};

type ApprovalQueueItem = Pick<
  AgentLoopBlockedToolExecution,
  "actionId" | "userId"
> & {
  messageId: string;
};

type ApprovalProgress = {
  current: number;
  total: number;
};

type BlockedActionsState = {
  conversationId: string | null;
  blockedActionsQueue: BlockedActionQueueItem[];
  approvalQueue: ApprovalQueueItem[];
};

const EMPTY_BLOCKED_ACTIONS_QUEUE: BlockedActionQueueItem[] = [];
const EMPTY_APPROVAL_QUEUE: ApprovalQueueItem[] = [];
const pulseDurationMs = 3000;

function getApprovalQueueItems(
  blockedActionsQueue: BlockedActionQueueItem[]
): ApprovalQueueItem[] {
  return blockedActionsQueue.flatMap(({ blockedAction, messageId }) =>
    blockedAction.status === "blocked_validation_required"
      ? [
          {
            actionId: blockedAction.actionId,
            userId: blockedAction.userId,
            messageId,
          },
        ]
      : []
  );
}

function mergeApprovalQueue(
  approvalQueue: ApprovalQueueItem[],
  blockedActionsQueue: BlockedActionQueueItem[]
): ApprovalQueueItem[] {
  const activeApprovals = getApprovalQueueItems(blockedActionsQueue);
  if (activeApprovals.length === 0) {
    return EMPTY_APPROVAL_QUEUE;
  }

  // Keep resolved approvals in the batch so remaining actions retain their original positions.
  const knownActionIds = new Set(approvalQueue.map(({ actionId }) => actionId));
  return [
    ...approvalQueue,
    ...activeApprovals.filter(({ actionId }) => !knownActionIds.has(actionId)),
  ];
}

type BlockedActionsContextType = {
  enqueueBlockedAction: (params: {
    messageId: string;
    blockedAction: AgentLoopBlockedToolExecution;
  }) => void;
  refreshBlockedActions: () => Promise<void>;
  removeCompletedAction: (actionId: string) => void;
  removeAllBlockedActionsForMessage: (params: {
    messageId: string;
    conversationId: string;
  }) => void;
  hasPendingValidations: (userId: string) => boolean;
  getBlockedActions: (userId: string) => AgentLoopBlockedToolExecution[];
  getBlockedActionItems: (userId: string) => BlockedActionQueueItem[];
  getApprovalProgress: (params: {
    actionId: string;
    userId: string;
  }) => ApprovalProgress | undefined;
  getFirstBlockedActionForMessage: (
    messageId: string
  ) => AgentLoopBlockedToolExecution | undefined;
  startPulsingAction: (actionId: string) => void;
  stopPulsingAction: (actionId: string) => void;
  isActionPulsing: (actionId: string) => boolean;
};

const BlockedActionsContext = createContext<
  BlockedActionsContextType | undefined
>(undefined);

export function useBlockedActionsContext() {
  const context = useContext(BlockedActionsContext);
  if (!context) {
    throw new Error(
      "useActionValidationContext must be used within an BlockedActionsContext"
    );
  }

  return context;
}

interface BlockedActionsProviderProps {
  owner: LightWorkspaceType;
  conversation?: ConversationListItemType;
  children: ReactNode;
}

export function BlockedActionsProvider({
  owner,
  conversation,
  children,
}: BlockedActionsProviderProps) {
  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
  const conversationId = conversation?.sId || null;

  // Fetch blocked actions from the database.
  const { blockedActions, mutate: mutateBlockedActions } = useBlockedActions({
    conversationId,
    workspaceId: owner.sId,
  });

  // Inlined queue management logic
  const [{ blockedActionsQueue, approvalQueue }, setBlockedActionsState] =
    useState<BlockedActionsState>({
      conversationId,
      blockedActionsQueue: EMPTY_BLOCKED_ACTIONS_QUEUE,
      approvalQueue: EMPTY_APPROVAL_QUEUE,
    });

  // State for tracking pulsing state of user manual required actions
  const [pulsingActionIds, setPulsingActionIds] = useState<Set<string>>(
    new Set()
  );
  const pulseTimersRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

  useEffect(() => {
    if (conversationId) {
      // Sub-agent (run_agent) conversations can be nested arbitrarily deep:
      // a `blocked_child_action_input_required` action can itself contain
      // child actions in the same `blocked_child_action_input_required` state.
      // Walk the tree to surface every leaf, anchored on the outermost
      // message id so removal/lookup matches the rendered agent message.
      const flattenBlockedActions = (
        actions: AgentLoopBlockedToolExecution[],
        outerMessageId: string
      ): BlockedActionQueueItem[] =>
        actions.flatMap((action) => {
          if (action.status === "blocked_child_action_input_required") {
            return flattenBlockedActions(
              action.childBlockedActionsList,
              outerMessageId
            );
          }
          return [{ blockedAction: action, messageId: outerMessageId }];
        });

      const nextBlockedActionsQueue = blockedActions.flatMap((action) =>
        flattenBlockedActions([action], action.messageId)
      );
      setBlockedActionsState((state) => ({
        conversationId,
        blockedActionsQueue: nextBlockedActionsQueue,
        approvalQueue:
          state.conversationId === conversationId
            ? mergeApprovalQueue(state.approvalQueue, nextBlockedActionsQueue)
            : getApprovalQueueItems(nextBlockedActionsQueue),
      }));
    } else {
      setBlockedActionsState({
        conversationId,
        blockedActionsQueue: EMPTY_BLOCKED_ACTIONS_QUEUE,
        approvalQueue: EMPTY_APPROVAL_QUEUE,
      });
    }
  }, [conversationId, blockedActions]);

  const enqueueBlockedAction = useCallback(
    ({
      messageId,
      blockedAction,
    }: {
      messageId: string;
      blockedAction: AgentLoopBlockedToolExecution;
    }) => {
      setBlockedActionsState((state) => {
        const previousQueue =
          state.conversationId === conversationId
            ? state.blockedActionsQueue
            : EMPTY_BLOCKED_ACTIONS_QUEUE;
        const existingIndex = previousQueue.findIndex(
          (v) => v.blockedAction.actionId === blockedAction.actionId
        );

        // If the action is not in the queue, add it.
        // If the action is in the queue, replace it with the new one.
        const nextBlockedActionsQueue =
          existingIndex === -1
            ? [...previousQueue, { blockedAction, messageId }]
            : previousQueue.map((item, index) =>
                index === existingIndex ? { blockedAction, messageId } : item
              );
        const previousApprovalQueue =
          state.conversationId === conversationId
            ? state.approvalQueue
            : EMPTY_APPROVAL_QUEUE;

        return {
          conversationId,
          blockedActionsQueue: nextBlockedActionsQueue,
          approvalQueue: mergeApprovalQueue(
            previousApprovalQueue,
            nextBlockedActionsQueue
          ),
        };
      });
    },
    [conversationId]
  );

  const startPulsingAction = useCallback((actionId: string) => {
    // Clear any existing timer for this action
    const existingTimer = pulseTimersRef.current.get(actionId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    setPulsingActionIds((prev) => new Set(prev).add(actionId));

    const timer = setTimeout(() => {
      setPulsingActionIds((prev) => {
        const newSet = new Set(prev);
        newSet.delete(actionId);
        return newSet;
      });
      pulseTimersRef.current.delete(actionId);
    }, pulseDurationMs);

    pulseTimersRef.current.set(actionId, timer);
  }, []);

  const stopPulsingAction = useCallback((actionId: string) => {
    const timer = pulseTimersRef.current.get(actionId);
    if (timer) {
      clearTimeout(timer);
      pulseTimersRef.current.delete(actionId);
    }

    setPulsingActionIds((prev) => {
      const newSet = new Set(prev);
      newSet.delete(actionId);
      return newSet;
    });
  }, []);

  const isActionPulsing = useCallback(
    (actionId: string) => pulsingActionIds.has(actionId),
    [pulsingActionIds]
  );

  const removeCompletedAction = useCallback(
    (actionId: string) => {
      stopPulsingAction(actionId);

      setBlockedActionsState((state) => {
        const nextBlockedActionsQueue = state.blockedActionsQueue.filter(
          (item) => item.blockedAction.actionId !== actionId
        );
        const hasPendingApprovals = nextBlockedActionsQueue.some(
          ({ blockedAction }) =>
            blockedAction.status === "blocked_validation_required"
        );

        return {
          ...state,
          blockedActionsQueue: nextBlockedActionsQueue,
          approvalQueue: hasPendingApprovals
            ? state.approvalQueue
            : EMPTY_APPROVAL_QUEUE,
        };
      });

      // Revalidate the blocked actions cache. Resolving an action happens
      // right after the OAuth popup closes, which refocuses the window and
      // can trigger an SWR focus revalidation that still sees the action as
      // blocked in the database. Mutating here discards that in-flight stale
      // response and refetches, so the resolved action is not re-inserted in
      // the queue.
      void mutateBlockedActions();
    },
    [stopPulsingAction, mutateBlockedActions]
  );

  const refreshBlockedActions = useCallback(async () => {
    await mutateBlockedActions();
  }, [mutateBlockedActions]);

  const hasPendingValidations = useCallback(
    (userId: string) => {
      return blockedActionsQueue.some(
        (action) =>
          action.blockedAction.status === "blocked_validation_required" &&
          canCurrentUserRespondToParentUserMessage({
            parentUserId: action.blockedAction.userId,
            currentUserId: userId,
          })
      );
    },
    [blockedActionsQueue]
  );

  const getBlockedActionItems = useCallback(
    (userId: string) => {
      return blockedActionsQueue.filter((action) =>
        canCurrentUserRespondToParentUserMessage({
          parentUserId: action.blockedAction.userId,
          currentUserId: userId,
        })
      );
    },
    [blockedActionsQueue]
  );

  const getBlockedActions = useCallback(
    (userId: string) =>
      getBlockedActionItems(userId).map((action) => action.blockedAction),
    [getBlockedActionItems]
  );

  const getApprovalProgress = useCallback(
    ({ actionId, userId }: { actionId: string; userId: string }) => {
      const userApprovalQueue = approvalQueue.filter((action) =>
        canCurrentUserRespondToParentUserMessage({
          parentUserId: action.userId,
          currentUserId: userId,
        })
      );
      const currentIndex = userApprovalQueue.findIndex(
        (action) => action.actionId === actionId
      );

      return currentIndex === -1
        ? undefined
        : { current: currentIndex + 1, total: userApprovalQueue.length };
    },
    [approvalQueue]
  );

  const { mutateConversations } = useConversations({
    workspaceId: owner.sId,
    options: { disabled: true },
  });

  const removeAllBlockedActionsForMessage = useCallback(
    ({
      messageId,
      conversationId,
    }: {
      messageId: string;
      conversationId: string;
    }) => {
      setBlockedActionsState((state) => {
        const nextBlockedActionsQueue = state.blockedActionsQueue.filter(
          (item) => item.messageId !== messageId
        );
        const hasPendingApprovals = nextBlockedActionsQueue.some(
          ({ blockedAction }) =>
            blockedAction.status === "blocked_validation_required"
        );

        return {
          ...state,
          blockedActionsQueue: nextBlockedActionsQueue,
          approvalQueue: hasPendingApprovals
            ? state.approvalQueue.filter(
                (approval) => approval.messageId !== messageId
              )
            : EMPTY_APPROVAL_QUEUE,
        };
      });

      // This is to update the unread inbox state in sidebar menu.
      // We only show the conversation in unread inbox if actionRequired is true (and this happens only when you come back to a conversation
      // since we don't update this value on frontend side), so we don't have to update the cache if it's not in the unread inbox.
      void mutateConversations(
        (currentData: ConversationListItemType[] | undefined) =>
          currentData?.map((c) =>
            c.sId === conversationId && c.actionRequired
              ? { ...c, actionRequired: false }
              : c
          ),
        { revalidate: false }
      );
    },
    [mutateConversations]
  );

  const getFirstBlockedActionForMessage = useCallback(
    (messageId: string) => {
      return blockedActionsQueue.find(
        (action) => action.messageId === messageId
      )?.blockedAction;
    },
    [blockedActionsQueue]
  );

  // Cleanup all timers on unmount
  useEffect(() => {
    return () => {
      pulseTimersRef.current.forEach((timer) => clearTimeout(timer));
      pulseTimersRef.current.clear();
    };
  }, []);

  const value = useMemo(
    () => ({
      enqueueBlockedAction,
      refreshBlockedActions,
      removeCompletedAction,
      removeAllBlockedActionsForMessage,
      hasPendingValidations,
      getBlockedActions,
      getBlockedActionItems,
      getApprovalProgress,
      getFirstBlockedActionForMessage,
      startPulsingAction,
      stopPulsingAction,
      isActionPulsing,
    }),
    [
      enqueueBlockedAction,
      refreshBlockedActions,
      removeCompletedAction,
      removeAllBlockedActionsForMessage,
      hasPendingValidations,
      getBlockedActions,
      getBlockedActionItems,
      getApprovalProgress,
      getFirstBlockedActionForMessage,
      startPulsingAction,
      stopPulsingAction,
      isActionPulsing,
    ]
  );

  return (
    <BlockedActionsContext.Provider value={value}>
      {children}
    </BlockedActionsContext.Provider>
  );
}
