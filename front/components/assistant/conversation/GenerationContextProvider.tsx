import { useBlockedActionsContext } from "@app/components/assistant/conversation/BlockedActionsProvider";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

type GeneratingMessage = {
  messageId: string;
  conversationId: string;
  agentId?: string;
};

type GenerationContextType = {
  generatingMessages: GeneratingMessage[];
  addGeneratingMessage: (params: {
    messageId: string;
    conversationId: string;
    agentId?: string;
  }) => void;
  removeGeneratingMessage: (params: { messageId: string }) => void;
  getConversationGeneratingMessages: (
    conversationId: string
  ) => GeneratingMessage[];
  pendingSteeringByConversation: Record<string, number>;
  incrementPendingSteeringCount: (conversationId: string) => void;
  clearPendingSteeringCount: (conversationId: string) => void;
};

const GenerationContext = createContext<GenerationContextType | undefined>(
  undefined
);

export function useGenerationContext(): GenerationContextType {
  const context = useContext(GenerationContext);

  if (!context) {
    throw new Error(
      "useGenerationContext must be used within a GenerationContextProvider"
    );
  }

  return context;
}

export const GenerationContextProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const [generatingMessages, setGeneratingMessages] = useState<
    GeneratingMessage[]
  >([]);
  const [pendingSteeringByConversation, setPendingSteeringByConversation] =
    useState<Record<string, number>>({});

  const { getFirstBlockedActionForMessage } = useBlockedActionsContext();

  const addGeneratingMessage = useCallback(
    ({
      messageId,
      conversationId,
      agentId,
    }: {
      messageId: string;
      conversationId: string;
      agentId?: string;
    }) => {
      setGeneratingMessages((prev) => {
        if (prev.some((m) => m.messageId === messageId)) {
          return prev;
        }
        if (prev.some((m) => m.conversationId === conversationId)) {
          setPendingSteeringByConversation(
            ({ [conversationId]: current = 0, ...rest }) =>
              current <= 1 ? rest : { ...rest, [conversationId]: current - 1 }
          );
        }
        return [...prev, { messageId, conversationId, agentId }];
      });
    },
    []
  );

  const removeGeneratingMessage = useCallback(
    ({ messageId }: { messageId: string }) => {
      setGeneratingMessages((prev) => {
        const removed = prev.find((m) => m.messageId === messageId);
        if (!removed) {
          return prev;
        }
        const next = prev.filter((m) => m.messageId !== messageId);
        if (!next.some((m) => m.conversationId === removed.conversationId)) {
          setPendingSteeringByConversation(
            ({ [removed.conversationId]: _, ...rest }) => rest
          );
        }
        return next;
      });
    },
    []
  );

  const incrementPendingSteeringCount = useCallback(
    (conversationId: string) => {
      setPendingSteeringByConversation((counts) => ({
        ...counts,
        [conversationId]: (counts[conversationId] ?? 0) + 1,
      }));
    },
    []
  );

  const clearPendingSteeringCount = useCallback((conversationId: string) => {
    setPendingSteeringByConversation((counts) => {
      const updated = { ...counts };
      delete updated[conversationId];
      return updated;
    });
  }, []);

  const getConversationGeneratingMessages = useCallback(
    (conversationId: string) => {
      return generatingMessages.filter(
        (m) =>
          m.conversationId === conversationId &&
          // Ignore messages that have a blocked action
          !getFirstBlockedActionForMessage(m.messageId)
      );
    },
    [generatingMessages, getFirstBlockedActionForMessage]
  );

  const value = useMemo(
    () => ({
      generatingMessages,
      addGeneratingMessage,
      removeGeneratingMessage,
      getConversationGeneratingMessages,
      pendingSteeringByConversation,
      incrementPendingSteeringCount,
      clearPendingSteeringCount,
    }),
    [
      generatingMessages,
      addGeneratingMessage,
      removeGeneratingMessage,
      getConversationGeneratingMessages,
      pendingSteeringByConversation,
      incrementPendingSteeringCount,
      clearPendingSteeringCount,
    ]
  );

  return (
    <GenerationContext.Provider value={value}>
      {children}
    </GenerationContext.Provider>
  );
};
