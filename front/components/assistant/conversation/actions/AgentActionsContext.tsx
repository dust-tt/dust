import { useHashParam } from "@dust-tt/sparkle";
import { useRouter } from "next/router";
import React from "react";

import type { ActionProgressState } from "@app/lib/assistant/state/messageReducer";

const AGENT_ACTIONS_HASH_PARAM = "agentActions";

interface AgentActionState {
  actionProgress: ActionProgressState;
  isActing: boolean;
  messageStatus?: "created" | "succeeded" | "failed" | "cancelled";
}

interface AgentActionsContextType {
  closeActions: () => void;
  messageId: string | null;
  isActionsOpen: boolean;
  openActions: (messageId: string, isUserInitiated?: boolean) => void;
  setActionState: (messageId: string, state: AgentActionState) => void;
  getActionState: (messageId: string) => AgentActionState;
  isAutoOpenDisabled: boolean;
}

const AgentActionsContext = React.createContext<
  AgentActionsContextType | undefined
>(undefined);

export function useAgentActionsContext() {
  const context = React.useContext(AgentActionsContext);
  if (!context) {
    throw new Error(
      "useAgentActionsContext must be used within a AgentActionsProvider"
    );
  }

  return context;
}

interface AgentActionsProviderProps {
  children: React.ReactNode;
}

export function AgentActionsProvider({ children }: AgentActionsProviderProps) {
  const router = useRouter();
  const [messageId, setMessageId] = useHashParam(AGENT_ACTIONS_HASH_PARAM);
  const [actionStates, setActionStates] = React.useState<
    Map<string, AgentActionState>
  >(new Map());
  // Track when user explicitly opens a different message's tools to prevent auto-opening
  const [userInitiatedMessageId, setUserInitiatedMessageId] = React.useState<
    string | null
  >(null);

  /**
   * Fix for shallow routing not closing actions panel.
   *
   * Issue: When navigating between conversations, Next.js uses shallow routing which changes
   * the URL path but doesn't trigger the 'hashchange' event that useHashParam relies on.
   * This causes the actions panel to remain open when it should close.
   *
   * Solution: Listen to Next.js router events and manually detect when the hash is removed
   * during navigation, then close the panel by clearing the messageId state.
   */
  React.useEffect(() => {
    const handleRouteChange = () => {
      // If there's no hash after route change, clear the content.
      if (!window.location.hash && messageId) {
        setMessageId(undefined);
      }
    };

    router.events.on("routeChangeComplete", handleRouteChange);
    return () => router.events.off("routeChangeComplete", handleRouteChange);
  }, [router.events, messageId, setMessageId]);

  const isActionsOpen = !!messageId;

  const openActions = React.useCallback(
    (msgId: string, isUserInitiated = false) => {
      setMessageId(msgId);
      if (isUserInitiated) {
        setUserInitiatedMessageId(msgId);
      }
    },
    [setMessageId]
  );

  const closeActions = React.useCallback(() => {
    setMessageId(undefined);
    // Clear user-initiated tracking when closing actions
    setUserInitiatedMessageId(null);
  }, [setMessageId]);

  const setActionState = React.useCallback(
    (msgId: string, state: AgentActionState) => {
      setActionStates((prev) => new Map(prev).set(msgId, state));
    },
    []
  );

  const getActionState = React.useCallback(
    (msgId: string): AgentActionState => {
      return (
        actionStates.get(msgId) || {
          actionProgress: new Map(),
          isActing: false,
          messageStatus: undefined,
        }
      );
    },
    [actionStates]
  );

  // Auto-opening is disabled when user explicitly opened any message's tools
  const isAutoOpenDisabled = userInitiatedMessageId !== null;

  const value: AgentActionsContextType = React.useMemo(
    () => ({
      closeActions,
      messageId: messageId || null,
      isActionsOpen,
      openActions,
      setActionState,
      getActionState,
      isAutoOpenDisabled,
    }),
    [
      closeActions,
      messageId,
      isActionsOpen,
      openActions,
      setActionState,
      getActionState,
      isAutoOpenDisabled,
    ]
  );

  return (
    <AgentActionsContext.Provider value={value}>
      {children}
    </AgentActionsContext.Provider>
  );
}
