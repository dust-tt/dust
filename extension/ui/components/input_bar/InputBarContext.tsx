import type { AgentMentionType } from "@dust-tt/client";
import React, { createContext, useState } from "react";

export const InputBarContext = createContext<{
  animate: boolean;
  selectedAgent: AgentMentionType | null;
  setAnimate: React.Dispatch<React.SetStateAction<boolean>>;
  setSelectedAgent: React.Dispatch<
    React.SetStateAction<AgentMentionType | null>
  >;
  attachPageBlinking: boolean;
  setAttachPageBlinking: React.Dispatch<React.SetStateAction<boolean>>;
}>({
  animate: false,
  selectedAgent: null,

  setAnimate: () => {},

  setSelectedAgent: () => {},
  attachPageBlinking: false,
  setAttachPageBlinking: () => {},
});

export function InputBarProvider({ children }: { children: React.ReactNode }) {
  const [animate, setAnimate] = useState<boolean>(false);
  const [attachPageBlinking, setAttachPageBlinking] = useState<boolean>(false);
  const [selectedAgent, setSelectedAgent] = useState<AgentMentionType | null>(
    null
  );

  return (
    <InputBarContext.Provider
      value={{
        animate,
        setAnimate,
        selectedAgent,
        setSelectedAgent,
        attachPageBlinking,
        setAttachPageBlinking,
      }}
    >
      {children}
    </InputBarContext.Provider>
  );
}
