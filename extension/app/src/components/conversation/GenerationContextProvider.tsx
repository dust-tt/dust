import { createContext, useState } from "react";

type GenerationContextType = {
  generatingMessages: { messageId: string; conversationId: string }[];
  setGeneratingMessages: React.Dispatch<
    React.SetStateAction<{ messageId: string; conversationId: string }[]>
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
  return (
    <GenerationContext.Provider
      value={{
        generatingMessages,
        setGeneratingMessages,
      }}
    >
      {children}
    </GenerationContext.Provider>
  );
};
