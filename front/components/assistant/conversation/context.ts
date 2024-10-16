import { createContext } from "react";

export const AgentMessageContext = createContext<{
  isLastMessage: boolean;
} | null>(null);
