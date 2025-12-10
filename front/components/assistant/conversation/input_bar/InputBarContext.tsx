import { createContext, useCallback, useState } from "react";

import type { RichAgentMention } from "@app/types";

export const InputBarContext = createContext<{
  animate: boolean;
  getAndClearSelectedAgent: () => RichAgentMention | null;
  setAnimate: React.Dispatch<React.SetStateAction<boolean>>;
  setSelectedAgent: (agentMention: RichAgentMention | null) => void;
}>({
  animate: false,
  getAndClearSelectedAgent: () => null,
  setAnimate: () => {},
  setSelectedAgent: () => {},
});

export function InputBarProvider({ children }: { children: React.ReactNode }) {
  const [animate, setAnimate] = useState<boolean>(false);

  // Useful when a component needs to set the selected agent for the input bar but do not have direct access to the input bar.
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

  // Immediately clear the selected agent and return the previous selected agent to avoid sticky agent mentions.
  const getAndClearSelectedAgent = useCallback(() => {
    const previousSelectedAgent = selectedAgent;
    setSelectedAgent(null);
    return previousSelectedAgent;
  }, [selectedAgent, setSelectedAgent]);

  return (
    <InputBarContext.Provider
      value={{
        animate,
        setAnimate,
        getAndClearSelectedAgent,
        setSelectedAgent: setSelectedAgentOuter,
      }}
    >
      {children}
    </InputBarContext.Provider>
  );
}
