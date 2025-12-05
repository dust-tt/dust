import type { ReactNode } from "react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
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
  mutateBlockedActions: () => void;
  getFirstBlockedActionForMessage: (
    messageId: string
  ) => BlockedToolExecution | undefined;
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
  const { blockedActions, mutate: mutateBlockedActions } = useBlockedActions({
    conversationId,
    workspaceId: owner.sId,
  });

  // Inlined queue management logic
  const [blockedActionsQueue, setBlockedActionsQueue] = useState<
    BlockedActionQueueItem[]
  >([]);

  useEffect(() => {
    if (conversationId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
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

  const removeCompletedAction = useCallback((actionId: string) => {
    setBlockedActionsQueue((prevQueue) =>
      prevQueue.filter((item) => item.blockedAction.actionId !== actionId)
    );
  }, []);

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
      return blockedActionsQueue
        .filter((action) => action.blockedAction.userId === userId)
        .map((action) => action.blockedAction);
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

  return (
    <BlockedActionsContext.Provider
      value={{
        enqueueBlockedAction,
        removeCompletedAction,
        removeAllBlockedActionsForMessage,
        mutateBlockedActions,
        hasPendingValidations,
        getBlockedActions,
        getFirstBlockedActionForMessage,
      }}
    >
      {children}
    </BlockedActionsContext.Provider>
  );
}
