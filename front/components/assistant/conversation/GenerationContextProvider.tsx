import { createContext, useState } from "react";

type GenerationContextType = {
  generatingMessageIds: string[];
  setGeneratingMessageIds: React.Dispatch<React.SetStateAction<string[]>>;
};

export const GenerationContext = createContext<
  GenerationContextType | undefined
>(undefined);

export const GenerationContextProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const [generatingMessageIds, setGeneratingMessageIds] = useState<string[]>(
    []
  );
  return (
    <GenerationContext.Provider
      value={{
        generatingMessageIds: generatingMessageIds,
        setGeneratingMessageIds: setGeneratingMessageIds,
      }}
    >
      {children}
    </GenerationContext.Provider>
  );
};
