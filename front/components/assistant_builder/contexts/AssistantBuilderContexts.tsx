import type { ReactNode } from "react";
import React, { memo } from "react";

import { DataSourceViewsProvider } from "@app/components/assistant_builder/contexts/DataSourceViewsContext";
import { MCPServerViewsProvider } from "@app/components/assistant_builder/contexts/MCPServerViewsContext";
import { PreviewPanelProvider } from "@app/components/assistant_builder/contexts/PreviewPanelContext";
import { SpacesProvider } from "@app/components/assistant_builder/contexts/SpacesContext";
import type { LightWorkspaceType } from "@app/types";

interface AssistantBuilderProvidersProps {
  owner: LightWorkspaceType;
  children: ReactNode;
}

export const AssistantBuilderProviders = memo(
  ({ owner, children }: AssistantBuilderProvidersProps) => {
    // Note: MCPServerViewsProvider depends on SpacesContext, so SpacesProvider must come first.
    return (
      <PreviewPanelProvider>
        <SpacesProvider owner={owner}>
          <DataSourceViewsProvider owner={owner}>
            <MCPServerViewsProvider owner={owner}>
              {children}
            </MCPServerViewsProvider>
          </DataSourceViewsProvider>
        </SpacesProvider>
      </PreviewPanelProvider>
    );
  }
);

AssistantBuilderProviders.displayName = "AssistantBuilderProviders";
