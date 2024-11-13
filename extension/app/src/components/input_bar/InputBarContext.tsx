import type { AgentMentionType } from "@dust-tt/client";
import { createContext, useState } from "react";

export const InputBarContext = createContext<{
  animate: boolean;
  selectedAssistant: AgentMentionType | null;
  setAnimate: React.Dispatch<React.SetStateAction<boolean>>;
  setSelectedAssistant: React.Dispatch<
    React.SetStateAction<AgentMentionType | null>
  >;
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
    useState<AgentMentionType | null>(null);

  return (
    <InputBarContext.Provider
      value={{
        animate,
        setAnimate,
        selectedAssistant,
        setSelectedAssistant,
      }}
    >
      {children}
    </InputBarContext.Provider>
  );
}
