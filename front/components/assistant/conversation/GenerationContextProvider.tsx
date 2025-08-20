import { createContext, useState } from "react";

import type { AgentStateClassification } from "@app/lib/assistant/state/messageReducer";

type GenerationContextType = {
  generatingMessages: { messageId: string; conversationId: string }[];
  setGeneratingMessages: React.Dispatch<
    React.SetStateAction<{ messageId: string; conversationId: string }[]>
  >;
  messageStates: Record<string, AgentStateClassification>;
  setMessageStates: React.Dispatch<
    React.SetStateAction<Record<string, AgentStateClassification>>
  >;
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
    { messageId: string; conversationId: string }[]
  >([]);
  const [messageStates, setMessageStates] = useState<
    Record<string, AgentStateClassification>
  >({});
  return (
    <GenerationContext.Provider
      value={{
        generatingMessages,
        setGeneratingMessages,
        messageStates,
        setMessageStates,
      }}
    >
      {children}
    </GenerationContext.Provider>
  );
};
