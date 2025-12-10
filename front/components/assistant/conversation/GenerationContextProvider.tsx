import { createContext, useCallback, useState } from "react";

import { useBlockedActionsContext } from "@app/components/assistant/conversation/BlockedActionsProvider";

type GeneratingMessage = {
  messageId: string;
  conversationId: string;
};

type GenerationContextType = {
  generatingMessages: GeneratingMessage[];
  addGeneratingMessage: (params: {
    messageId: string;
    conversationId: string;
  }) => void;
  removeGeneratingMessage: (params: { messageId: string }) => void;
  getConversationGeneratingMessages: (
    conversationId: string
  ) => GeneratingMessage[];
};

export const GenerationContext = createContext<
  GenerationContextType | undefined
>(undefined);

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
    }: {
      messageId: string;
      conversationId: string;
    }) => {
      setGeneratingMessages((prev) => {
        if (prev.some((m) => m.messageId === messageId)) {
          return prev;
        }
        return [...prev, { messageId, conversationId }];
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

  return (
    <GenerationContext.Provider
      value={{
        generatingMessages,
        addGeneratingMessage,
        removeGeneratingMessage,
        getConversationGeneratingMessages,
      }}
    >
      {children}
    </GenerationContext.Provider>
  );
};
