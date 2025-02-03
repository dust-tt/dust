import type { AgentMention, UserMessageType } from "@dust-tt/types";
import { createContext, useState } from "react";

export const InputBarContext = createContext<{
  animate: boolean;
  selectedAssistant: AgentMention | null;
  editMessage: UserMessageType | null;
  setAnimate: React.Dispatch<React.SetStateAction<boolean>>;
  setSelectedAssistant: React.Dispatch<
    React.SetStateAction<AgentMention | null>
  >;
  setEditMessage: React.Dispatch<React.SetStateAction<UserMessageType | null>>;
}>({
  animate: false,
  selectedAssistant: null,
  editMessage: null,
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  setAnimate: () => {},
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  setSelectedAssistant: () => {},
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  setEditMessage: () => {},
});

export function InputBarProvider({ children }: { children: React.ReactNode }) {
  const [animate, setAnimate] = useState<boolean>(false);
  const [selectedAssistant, setSelectedAssistant] =
    useState<AgentMention | null>(null);
  const [editMessage, setEditMessage] = useState<UserMessageType | null>(null);

  return (
    <InputBarContext.Provider
      value={{
        animate,
        setAnimate,
        selectedAssistant,
        setSelectedAssistant,
        editMessage,
        setEditMessage,
      }}
    >
      {children}
    </InputBarContext.Provider>
  );
}
