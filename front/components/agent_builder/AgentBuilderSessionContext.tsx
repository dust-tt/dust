import type { ReactNode } from "react";
import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import { v4 as uuidv4 } from "uuid";

export type CloseReason = "cancel" | "navigation" | "save";

const SESSION_STORAGE_KEY = "agent_builder_copilot_session";
const CONVERSATION_STORAGE_KEY = "agent_builder_copilot_conversation";

interface AgentBuilderSessionContextType {
  sessionId: string;
  copilotConversationId: string | null;
  setCopilotConversationId: (id: string) => void;
  closeReason: CloseReason | null;
  setCloseReason: (reason: CloseReason) => void;
  isResumedSession: boolean;
}

const AgentBuilderSessionContext = createContext<
  AgentBuilderSessionContextType | undefined
>(undefined);

export const useAgentBuilderSessionContext = () => {
  const context = useContext(AgentBuilderSessionContext);
  if (!context) {
    throw new Error(
      "useAgentBuilderSessionContext must be used within an AgentBuilderSessionProvider"
    );
  }
  return context;
};

interface AgentBuilderSessionProviderProps {
  children: ReactNode;
}

export const AgentBuilderSessionProvider = ({
  children,
}: AgentBuilderSessionProviderProps) => {
  // Check if this is a resumed session (session ID stored in sessionStorage)
  const [{ sessionId, isResumedSession, initialConversationId }] = useState(
    () => {
      if (typeof window !== "undefined") {
        const storedSession = sessionStorage.getItem(SESSION_STORAGE_KEY);
        const storedConversation = sessionStorage.getItem(
          CONVERSATION_STORAGE_KEY
        );

        if (storedSession) {
          // Clear storage immediately after reading
          sessionStorage.removeItem(SESSION_STORAGE_KEY);
          sessionStorage.removeItem(CONVERSATION_STORAGE_KEY);

          return {
            sessionId: storedSession,
            isResumedSession: true,
            initialConversationId: storedConversation,
          };
        }
      }
      return {
        sessionId: uuidv4(),
        isResumedSession: false,
        initialConversationId: null,
      };
    }
  );

  const [copilotConversationId, setCopilotConversationIdState] = useState<
    string | null
  >(initialConversationId);

  // Use ref for close reason since it's only read in cleanup effect, not during render
  const closeReasonRef = useRef<CloseReason | null>(null);

  const setCopilotConversationId = useCallback((id: string) => {
    setCopilotConversationIdState(id);
  }, []);

  const setCloseReason = useCallback((reason: CloseReason) => {
    closeReasonRef.current = reason;
  }, []);

  const value: AgentBuilderSessionContextType = useMemo(
    () => ({
      sessionId,
      copilotConversationId,
      setCopilotConversationId,
      get closeReason() {
        return closeReasonRef.current;
      },
      setCloseReason,
      isResumedSession,
    }),
    [
      sessionId,
      copilotConversationId,
      setCopilotConversationId,
      setCloseReason,
      isResumedSession,
    ]
  );

  return (
    <AgentBuilderSessionContext.Provider value={value}>
      {children}
    </AgentBuilderSessionContext.Provider>
  );
};

// Helper to store session for resume (called before URL change)
export const storeSessionForResume = (
  sessionId: string,
  conversationId: string | null
): void => {
  if (typeof window !== "undefined") {
    sessionStorage.setItem(SESSION_STORAGE_KEY, sessionId);
    if (conversationId) {
      sessionStorage.setItem(CONVERSATION_STORAGE_KEY, conversationId);
    }
  }
};

AgentBuilderSessionProvider.displayName = "AgentBuilderSessionProvider";
