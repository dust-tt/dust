import React, { createContext, useContext, useMemo, useState } from "react";

interface AgentBuilderSettingsContextType {
  name: string;
  setName: (name: string) => void;
  description: string;
  setDescription: (description: string) => void;
}

const AgentBuilderSettingsContext = createContext<
  AgentBuilderSettingsContextType | undefined
>(undefined);

interface AgentBuilderSettingsProviderProps {
  children: React.ReactNode;
}

export function AgentBuilderSettingsProvider({
  children,
}: AgentBuilderSettingsProviderProps) {
  const [name, setName] = useState<string>("");
  const [description, setDescription] = useState<string>("");

  const contextValue = useMemo(
    () => ({
      name,
      setName,
      description,
      setDescription,
    }),
    [name, description]
  );

  return (
    <AgentBuilderSettingsContext.Provider value={contextValue}>
      {children}
    </AgentBuilderSettingsContext.Provider>
  );
}

export function useAgentBuilderSettingsContext() {
  const context = useContext(AgentBuilderSettingsContext);
  if (context === undefined) {
    throw new Error(
      "useAgentBuilderSettingsContext must be used within an AgentBuilderSettingsProvider"
    );
  }
  return context;
}
