import { createContext, useCallback, useState } from "react";

import type { AgentMention } from "@app/types";

export const InputBarContext = createContext<{
  animate: boolean;
  selectedAssistant: AgentMention | null;
  setAnimate: React.Dispatch<React.SetStateAction<boolean>>;
  setSelectedAssistant: (agentMention: AgentMention | null) => void;
}>({
  animate: false,
  selectedAssistant: null,
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  setAnimate: () => {},
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  setSelectedAssistant: () => {},
});

export function InputBarProvider({ children }: { children: React.ReactNode }) {
  const [animate, setAnimate] = useState<boolean>(false);
  const [selectedAssistant, setSelectedAssistant] =
    useState<AgentMention | null>(null);

  const setSelectedAssistantOuter = useCallback(
    (agentMention: AgentMention | null) => {
      if (agentMention) {
        setAnimate(true);
      } else {
        setAnimate(false);
      }
      setSelectedAssistant(agentMention);
    },
    [setSelectedAssistant]
  );

  return (
    <InputBarContext.Provider
      value={{
        animate,
        setAnimate,
        selectedAssistant,
        setSelectedAssistant: setSelectedAssistantOuter,
      }}
    >
      {children}
    </InputBarContext.Provider>
  );
}
