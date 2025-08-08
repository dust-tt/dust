import { createContext, useContext, useMemo } from "react";

import { DataSourceViewsProvider } from "@app/components/agent_builder/DataSourceViewsContext";
import { MCPServerViewsProvider } from "@app/components/agent_builder/MCPServerViewsContext";
import { PreviewPanelProvider } from "@app/components/agent_builder/PreviewPanelContext";
import { SpacesProvider } from "@app/components/agent_builder/SpacesContext";
import type { UserType, WorkspaceType } from "@app/types";

type AgentBuilderContextType = {
  owner: WorkspaceType;
  user: UserType;
};

export const AgentBuilderContext = createContext<
  AgentBuilderContextType | undefined
>(undefined);

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
  const value = useMemo(
    () => ({
      owner,
      user,
    }),
    [owner, user]
  );

  return (
    <AgentBuilderContext.Provider value={value}>
      <PreviewPanelProvider>
        <SpacesProvider owner={owner}>
          <MCPServerViewsProvider owner={owner}>
            <DataSourceViewsProvider owner={owner}>
              {children}
            </DataSourceViewsProvider>
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
