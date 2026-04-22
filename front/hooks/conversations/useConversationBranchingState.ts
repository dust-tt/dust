import { useCallback, useSyncExternalStore } from "react";

export type PendingConversationBranch = {
  sourceMessageId: string | null;
  startedAt: number;
};

type ConversationBranchingState = {
  inFlightBranch: PendingConversationBranch | null;
  pendingForkNotice: PendingConversationBranch | null;
};

const EMPTY_BRANCHING_STATE: ConversationBranchingState = {
  inFlightBranch: null,
  pendingForkNotice: null,
};

const branchingStateByConversationId = new Map<
  string,
  ConversationBranchingState
>();
const listeners = new Set<() => void>();

function emitChange() {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

function getConversationBranchingState(
  conversationId?: string | null
): ConversationBranchingState {
  if (!conversationId) {
    return EMPTY_BRANCHING_STATE;
  }

  return (
    branchingStateByConversationId.get(conversationId) ?? EMPTY_BRANCHING_STATE
  );
}

function setConversationBranchingState(
  conversationId: string,
  state: ConversationBranchingState
) {
  if (!state.inFlightBranch && !state.pendingForkNotice) {
    branchingStateByConversationId.delete(conversationId);
  } else {
    branchingStateByConversationId.set(conversationId, state);
  }

  emitChange();
}

export function useConversationBranchingState(conversationId?: string | null) {
  const state = useSyncExternalStore(
    subscribe,
    () => getConversationBranchingState(conversationId),
    () => EMPTY_BRANCHING_STATE
  );

  const startBranching = useCallback(
    (sourceMessageId?: string) => {
      if (!conversationId) {
        return null;
      }

      const branch: PendingConversationBranch = {
        sourceMessageId: sourceMessageId ?? null,
        startedAt: Date.now(),
      };

      setConversationBranchingState(conversationId, {
        inFlightBranch: branch,
        pendingForkNotice: branch,
      });

      return branch;
    },
    [conversationId]
  );

  const markBranchCreated = useCallback(() => {
    if (!conversationId) {
      return;
    }

    const currentState = getConversationBranchingState(conversationId);
    if (!currentState.inFlightBranch) {
      return;
    }

    setConversationBranchingState(conversationId, {
      inFlightBranch: null,
      pendingForkNotice: currentState.pendingForkNotice,
    });
  }, [conversationId]);

  const clearBranchingState = useCallback(() => {
    if (!conversationId) {
      return;
    }

    setConversationBranchingState(conversationId, EMPTY_BRANCHING_STATE);
  }, [conversationId]);

  const clearPendingForkNotice = useCallback(() => {
    if (!conversationId) {
      return;
    }

    const currentState = getConversationBranchingState(conversationId);
    if (!currentState.pendingForkNotice) {
      return;
    }

    setConversationBranchingState(conversationId, {
      ...currentState,
      pendingForkNotice: null,
    });
  }, [conversationId]);

  return {
    inFlightBranch: state.inFlightBranch,
    pendingForkNotice: state.pendingForkNotice,
    isBranching: state.inFlightBranch !== null,
    startBranching,
    markBranchCreated,
    clearBranchingState,
    clearPendingForkNotice,
  };
}
