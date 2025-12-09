import { createContext, useCallback, useState } from "react";

import type { RichAgentMention } from "@app/types";

export const InputBarContext = createContext<{
  animate: boolean;
  selectedAgent: RichAgentMention | null;
  setAnimate: React.Dispatch<React.SetStateAction<boolean>>;
  setSelectedAgent: (agentMention: RichAgentMention | null) => void;
}>({
  animate: false,
  selectedAgent: null,

  setAnimate: () => {},

  setSelectedAgent: () => {},
});

export function InputBarProvider({ children }: { children: React.ReactNode }) {
  const [animate, setAnimate] = useState<boolean>(false);
  const [selectedAgent, setSelectedAgent] = useState<RichAgentMention | null>(
    null
  );

  const setSelectedAgentOuter = useCallback(
    (agentMention: RichAgentMention | null) => {
      if (agentMention) {
        setAnimate(true);
      } else {
        setAnimate(false);
      }
      setSelectedAgent(agentMention);
    },
    [setSelectedAgent]
  );

  return (
    <InputBarContext.Provider
      value={{
        animate,
        setAnimate,
        selectedAgent,
        setSelectedAgent: setSelectedAgentOuter,
      }}
    >
      {children}
    </InputBarContext.Provider>
  );
}
