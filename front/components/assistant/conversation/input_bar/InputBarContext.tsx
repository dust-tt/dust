import type { AgentMention } from "@dust-tt/types";
import { createContext } from "react";

export const InputBarContext = createContext<{
  animate: boolean;
  selectedAssistant: AgentMention | null;
}>({
  animate: false,
  selectedAssistant: null,
});
