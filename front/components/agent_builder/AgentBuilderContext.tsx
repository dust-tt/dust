import type { ReactNode } from "react";
import React, { createContext, useContext, useMemo, useState } from "react";

import { DataSourceViewsProvider } from "@app/components/agent_builder/DataSourceViewsContext";
import { MCPServerViewsProvider } from "@app/components/agent_builder/MCPServerViewsContext";
import { PreviewPanelProvider } from "@app/components/agent_builder/PreviewPanelContext";
import { SpacesProvider } from "@app/components/agent_builder/SpacesContext";
import type { FetchAgentTemplateResponse } from "@app/pages/api/templates/[tId]";
import type { TemplateActionPreset, UserType, WorkspaceType } from "@app/types";

type AgentBuilderContextType = {
  owner: WorkspaceType;
  user: UserType;
  assistantTemplate: FetchAgentTemplateResponse | null;
  presetActionToAdd: TemplateActionPreset | null;
  setPresetActionToAdd: (preset: TemplateActionPreset | null) => void;
};

const AgentBuilderContext = createContext<
  AgentBuilderContextType | undefined
>(undefined);

interface AgentBuilderProviderProps {
  owner: WorkspaceType;
  user: UserType;
  assistantTemplate: FetchAgentTemplateResponse | null;
  children: ReactNode;
}

export function AgentBuilderProvider({
  owner,
  user,
  assistantTemplate,
  children,
}: AgentBuilderProviderProps) {
  const [presetActionToAdd, setPresetActionToAdd] =
    useState<TemplateActionPreset | null>(null);

  const value = useMemo(
    () => ({
      owner,
      user,
      assistantTemplate,
      presetActionToAdd,
      setPresetActionToAdd,
    }),
    [owner, user, assistantTemplate, presetActionToAdd]
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
