import { createContext, useCallback, useState } from "react";

import type { AgentMention } from "@app/types";

export const InputBarContext = createContext<{
  animate: boolean;
  selectedAgent: AgentMention | null;
  setAnimate: React.Dispatch<React.SetStateAction<boolean>>;
  setSelectedAgent: (agentMention: AgentMention | null) => void;
}>({
  animate: false,
  selectedAgent: null,
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  setAnimate: () => {},
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  setSelectedAgent: () => {},
});

export function InputBarProvider({ children }: { children: React.ReactNode }) {
  const [animate, setAnimate] = useState<boolean>(false);
  const [selectedAgent, setSelectedAgent] = useState<AgentMention | null>(null);

  const setSelectedAgentOuter = useCallback(
    (agentMention: AgentMention | null) => {
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
