import type { AgentMention, LightAgentConfigurationType } from "@dust-tt/types";
import { createContext, useState } from "react";

export const InputBarContext = createContext<{
  animate: boolean;
  selectedAssistant: AgentMention | null;
  setAnimate: React.Dispatch<React.SetStateAction<boolean>>;
  setSelectedAssistant: React.Dispatch<
    React.SetStateAction<AgentMention | null>
  >;
  inputBarAssistants: LightAgentConfigurationType[];
  setInputBarAssistants: React.Dispatch<
    React.SetStateAction<LightAgentConfigurationType[]>
  >;
  inputBarAssistantsLoading: boolean;
  setInputBarAssistantsLoading: React.Dispatch<React.SetStateAction<boolean>>;
}>({
  animate: false,
  selectedAssistant: null,
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  setAnimate: () => {},
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  setSelectedAssistant: () => {},
  inputBarAssistants: [],
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  setInputBarAssistants: () => {},
  inputBarAssistantsLoading: false,
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  setInputBarAssistantsLoading: () => {},
});

export function InputBarProvider({ children }: { children: React.ReactNode }) {
  const [animate, setAnimate] = useState<boolean>(false);
  const [selectedAssistant, setSelectedAssistant] =
    useState<AgentMention | null>(null);
  const [inputBarAssistants, setInputBarAssistants] = useState<
    LightAgentConfigurationType[]
  >([]);
  const [inputBarAssistantsLoading, setInputBarAssistantsLoading] =
    useState<boolean>(false);

  return (
    <InputBarContext.Provider
      value={{
        animate,
        setAnimate,
        selectedAssistant,
        setSelectedAssistant,
        inputBarAssistants,
        setInputBarAssistants,
        inputBarAssistantsLoading,
        setInputBarAssistantsLoading,
      }}
    >
      {children}
    </InputBarContext.Provider>
  );
}
