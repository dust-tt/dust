import React, { createContext, useContext, useMemo, useState } from "react";

import type { AssistantBuilderActionState } from "@app/components/assistant_builder/types";

interface AgentBuilderCapabilitiesContextType {
  actions: AssistantBuilderActionState[];
  setActions: (actions: AssistantBuilderActionState[]) => void;
}

const AgentBuilderCapabilitiesContext = createContext<
  AgentBuilderCapabilitiesContextType | undefined
>(undefined);

interface AgentBuilderCapabilitiesProviderProps {
  children: React.ReactNode;
}

export function AgentBuilderCapabilitiesProvider({
  children,
}: AgentBuilderCapabilitiesProviderProps) {
  const [actions, setActions] = useState<AssistantBuilderActionState[]>([]);

  const contextValue = useMemo(
    () => ({
      actions,
      setActions,
    }),
    [actions]
  );

  return (
    <AgentBuilderCapabilitiesContext.Provider value={contextValue}>
      {children}
    </AgentBuilderCapabilitiesContext.Provider>
  );
}

export function useAgentBuilderCapabilitiesContext() {
  const context = useContext(AgentBuilderCapabilitiesContext);
  if (context === undefined) {
    throw new Error(
      "useAgentBuilderCapabilitiesContext must be used within an AgentBuilderCapabilitiesProvider"
    );
  }
  return context;
}
