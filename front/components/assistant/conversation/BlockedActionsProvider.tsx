import type { ReactNode } from "react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

import type { BlockedToolExecution } from "@app/lib/actions/mcp";
import { useBlockedActions } from "@app/lib/swr/blocked_actions";
import { useConversations } from "@app/lib/swr/conversations";
import type {
  ConversationWithoutContentType,
  LightWorkspaceType,
} from "@app/types";

type BlockedActionQueueItem = {
  messageId: string;
  blockedAction: BlockedToolExecution;
};

const EMPTY_BLOCKED_ACTIONS_QUEUE: BlockedActionQueueItem[] = [];
const PULSE_DURATION_MS = 3000;

type BlockedActionsContextType = {
  enqueueBlockedAction: (params: {
    messageId: string;
    blockedAction: BlockedToolExecution;
  }) => void;
  removeCompletedAction: (actionId: string) => void;
  removeAllBlockedActionsForMessage: (params: {
    messageId: string;
    conversationId: string;
  }) => void;
  hasPendingValidations: (userId: string) => boolean;
  getBlockedActions: (userId: string) => BlockedToolExecution[];
  getFirstBlockedActionForMessage: (
    messageId: string
  ) => BlockedToolExecution | undefined;
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
  conversation: ConversationWithoutContentType | null;
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
  const { blockedActions } = useBlockedActions({
    conversationId,
    workspaceId: owner.sId,
  });

  // Inlined queue management logic
  const [blockedActionsQueue, setBlockedActionsQueue] = useState<
    BlockedActionQueueItem[]
  >([]);

  // State for tracking pulsing state of user manual required actions
  const [pulsingActionIds, setPulsingActionIds] = useState<Set<string>>(
    new Set()
  );
  const pulseTimersRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

  useEffect(() => {
    if (conversationId) {
      setBlockedActionsQueue(
        blockedActions.flatMap((action): BlockedActionQueueItem[] => {
          if (action.status === "blocked_child_action_input_required") {
            return action.childBlockedActionsList.map((childAction) => ({
              blockedAction: childAction,
              messageId: action.messageId,
            }));
          } else {
            return [{ blockedAction: action, messageId: action.messageId }];
          }
        })
      );
    } else {
      setBlockedActionsQueue(EMPTY_BLOCKED_ACTIONS_QUEUE);
    }
  }, [conversationId, blockedActions]);

  const enqueueBlockedAction = useCallback(
    ({
      messageId,
      blockedAction,
    }: {
      messageId: string;
      blockedAction: BlockedToolExecution;
    }) => {
      setBlockedActionsQueue((prevQueue) => {
        const existingIndex = prevQueue.findIndex(
          (v) => v.blockedAction.actionId === blockedAction.actionId
        );

        // If the action is not in the queue, add it.
        // If the action is in the queue, replace it with the new one.
        return existingIndex === -1
          ? [...prevQueue, { blockedAction, messageId }]
          : prevQueue.map((item, index) =>
              index === existingIndex ? { blockedAction, messageId } : item
            );
      });
    },
    []
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
    }, PULSE_DURATION_MS);

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

      setBlockedActionsQueue((prevQueue) =>
        prevQueue.filter((item) => item.blockedAction.actionId !== actionId)
      );
    },
    [stopPulsingAction]
  );

  const hasPendingValidations = useCallback(
    (userId: string) => {
      return blockedActionsQueue.some(
        (action) =>
          action.blockedAction.status === "blocked_validation_required" &&
          action.blockedAction.userId === userId
      );
    },
    [blockedActionsQueue]
  );

  const getBlockedActions = useCallback(
    (userId: string) => {
      return (
        blockedActionsQueue
          // Either actions associated to the user or actions created through the Public API and not
          // associated to any user.
          .filter(
            (action) =>
              action.blockedAction.userId === userId ||
              !action.blockedAction.userId
          )
          .map((action) => action.blockedAction)
      );
    },
    [blockedActionsQueue]
  );

  const { mutateConversations } = useConversations({
    workspaceId: owner.sId,
    options: {
      disabled: true,
    },
  });

  const removeAllBlockedActionsForMessage = useCallback(
    ({
      messageId,
      conversationId,
    }: {
      messageId: string;
      conversationId: string;
    }) => {
      setBlockedActionsQueue((prevQueue) =>
        prevQueue.filter((item) => item.messageId !== messageId)
      );

      // This is to update the unread inbox state in sidebar menu.
      // We only show the conversation in unread inbox if actionRequired is true (and this happens only when you come back to a conversation
      // since we don't update this value on frontend side), so we don't have to update the cache if it's not in the unread inbox.
      void mutateConversations(
        (currentData) => {
          if (!currentData?.conversations) {
            return currentData;
          }
          return {
            conversations: currentData.conversations.map((c) =>
              c.sId === conversationId && c.actionRequired
                ? { ...c, actionRequired: false }
                : c
            ),
          };
        },
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

  return (
    <BlockedActionsContext.Provider
      value={{
        enqueueBlockedAction,
        removeCompletedAction,
        removeAllBlockedActionsForMessage,
        hasPendingValidations,
        getBlockedActions,
        getFirstBlockedActionForMessage,
        startPulsingAction,
        stopPulsingAction,
        isActionPulsing,
      }}
    >
      {children}
    </BlockedActionsContext.Provider>
  );
}
