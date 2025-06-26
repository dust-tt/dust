import { AssistantBuilderMCPOrVizState } from "@app/components/assistant_builder/types";
import React, { createContext, useContext, useMemo, useState } from "react";

interface AgentBuilderCapabilitiesContextType {
  actions: AssistantBuilderMCPOrVizState[];
  setActions: React.Dispatch<
    React.SetStateAction<AssistantBuilderMCPOrVizState[]>
  >;
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
  const [actions, setActions] = useState<AssistantBuilderMCPOrVizState[]>([]);

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
