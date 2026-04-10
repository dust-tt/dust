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

type GenerationDispatchContextType = {
  addGeneratingMessage: (params: {
    messageId: string;
    conversationId: string;
    agentId?: string;
  }) => void;
  removeGeneratingMessage: (params: { messageId: string }) => void;
};

type GenerationStateContextType = {
  generatingMessages: GeneratingMessage[];
  getConversationGeneratingMessages: (
    conversationId: string
  ) => GeneratingMessage[];
};

// Split into two contexts so components that only dispatch (add/remove)
// don't re-render when the generating messages list changes.
const GenerationDispatchContext =
  createContext<GenerationDispatchContextType | undefined>(undefined);

const GenerationStateContext =
  createContext<GenerationStateContextType | undefined>(undefined);

export function useGenerationDispatch(): GenerationDispatchContextType {
  const context = useContext(GenerationDispatchContext);

  if (!context) {
    throw new Error(
      "useGenerationDispatch must be used within a GenerationContextProvider"
    );
  }

  return context;
}

export function useGenerationContext(): GenerationDispatchContextType &
  GenerationStateContextType {
  const dispatch = useContext(GenerationDispatchContext);
  const state = useContext(GenerationStateContext);

  if (!dispatch || !state) {
    throw new Error(
      "useGenerationContext must be used within a GenerationContextProvider"
    );
  }

  return useMemo(() => ({ ...dispatch, ...state }), [dispatch, state]);
}

/**
 * Returns whether multiple agents are currently generating in the given conversation.
 * Uses the state context, so only call this from components that need it (e.g. streaming messages).
 */
export function useHasMultipleGeneratingAgents(
  conversationId: string
): boolean {
  const state = useContext(GenerationStateContext);

  if (!state) {
    throw new Error(
      "useHasMultipleGeneratingAgents must be used within a GenerationContextProvider"
    );
  }

  return (
    state.getConversationGeneratingMessages(conversationId).length > 1
  );
}


export const GenerationContextProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const [generatingMessages, setGeneratingMessages] = useState<
    GeneratingMessage[]
  >([]);

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
        return [...prev, { messageId, conversationId, agentId }];
      });
    },
    []
  );

  const removeGeneratingMessage = useCallback(
    ({ messageId }: { messageId: string }) => {
      setGeneratingMessages((prev) => {
        if (!prev.some((m) => m.messageId === messageId)) {
          return prev;
        }
        return prev.filter((m) => m.messageId !== messageId);
      });
    },
    []
  );

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

  const dispatchValue = useMemo(
    () => ({
      addGeneratingMessage,
      removeGeneratingMessage,
    }),
    [addGeneratingMessage, removeGeneratingMessage]
  );

  const stateValue = useMemo(
    () => ({
      generatingMessages,
      getConversationGeneratingMessages,
    }),
    [generatingMessages, getConversationGeneratingMessages]
  );

  return (
    <GenerationDispatchContext.Provider value={dispatchValue}>
      <GenerationStateContext.Provider value={stateValue}>
        {children}
      </GenerationStateContext.Provider>
    </GenerationDispatchContext.Provider>
  );
};
