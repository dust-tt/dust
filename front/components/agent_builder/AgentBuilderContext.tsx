import { createContext, useContext } from "react";

import { DataSourceViewsProvider } from "@app/components/agent_builder/DataSourceViewsContext";
import { MCPServerViewsProvider } from "@app/components/agent_builder/MCPServerViewsContext";
import { PreviewPanelProvider } from "@app/components/agent_builder/PreviewPanelContext";
import { SpacesProvider } from "@app/components/agent_builder/SpacesContext";
import { MCPServerViewsProvider as MCPServerViewsProviderToBeRemoved } from "@app/components/assistant_builder/contexts/MCPServerViewsContext";
import { SpacesProvider as SpacesProviderToBeRemoved } from "@app/components/assistant_builder/contexts/SpacesContext";
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

// TODO: Move all the components from Assistant Builder to Agent builder
// and remove the context providers from /assistant_builder
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
          <SpacesProviderToBeRemoved owner={owner}>
            <MCPServerViewsProvider owner={owner}>
              <MCPServerViewsProviderToBeRemoved owner={owner}>
                <DataSourceViewsProvider owner={owner}>
                  {children}
                </DataSourceViewsProvider>
              </MCPServerViewsProviderToBeRemoved>
            </MCPServerViewsProvider>
          </SpacesProviderToBeRemoved>
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
