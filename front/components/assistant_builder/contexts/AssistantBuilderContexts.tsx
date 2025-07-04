import type { ReactNode } from "react";
import React from "react";

import { DataSourceViewsProvider } from "@app/components/assistant_builder/contexts/DataSourceViewsContext";
import { MCPServerViewsProvider } from "@app/components/assistant_builder/contexts/MCPServerViewsContext";
import { PreviewPanelProvider } from "@app/components/assistant_builder/contexts/PreviewPanelContext";
import { SpacesProvider } from "@app/components/assistant_builder/contexts/SpacesContext";
import type { LightWorkspaceType } from "@app/types";

interface AssistantBuilderProvidersProps {
  owner: LightWorkspaceType;
  children: ReactNode;
}

export const AssistantBuilderProviders = ({
  owner,
  children,
}: AssistantBuilderProvidersProps) => {
  // Note: MCPServerViewsProvider depends on SpacesContext, so SpacesProvider must come first.
  return (
    <PreviewPanelProvider>
      <SpacesProvider owner={owner}>
        <MCPServerViewsProvider owner={owner}>
          <DataSourceViewsProvider owner={owner}>
            {children}
          </DataSourceViewsProvider>
        </MCPServerViewsProvider>
      </SpacesProvider>
    </PreviewPanelProvider>
  );
};

AssistantBuilderProviders.displayName = "AssistantBuilderProviders";
