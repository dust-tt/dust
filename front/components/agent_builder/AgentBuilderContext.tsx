import { createContext, useContext } from "react";

import { MCPServerViewsProvider } from "@app/components/agent_builder/MCPServerViewsContext";
import { PreviewPanelProvider } from "@app/components/agent_builder/PreviewPanelContext";
import { SpacesProvider } from "@app/components/agent_builder/SpacesContext";
import type { UserType, WorkspaceType } from "@app/types";

type AgentBuilderContextType = {
  owner: WorkspaceType;
  user: UserType;
};

export const AgentBuilderContext = createContext<AgentBuilderContextType>({
  owner: {} as WorkspaceType,
  user: {} as UserType,
});

interface AgentBuilderContextProps extends AgentBuilderContextType {
  children: React.ReactNode;
}

export function AgentBuilderProvider({
  owner,
  user,
  children,
}: AgentBuilderContextProps) {
  return (
    <AgentBuilderContext.Provider
      value={{
        owner,
        user,
      }}
    >
      <PreviewPanelProvider>
        <SpacesProvider owner={owner}>
          <MCPServerViewsProvider owner={owner}>
            {children}
          </MCPServerViewsProvider>
        </SpacesProvider>
      </PreviewPanelProvider>
    </AgentBuilderContext.Provider>
  );
}

export function useAgentBuilderContext() {
  const context = useContext(AgentBuilderContext);
  if (!context) {
    throw new Error(
      "useAgentBuilderContext must be used within an AgentBuilderProvider"
    );
  }
  return context;
}
