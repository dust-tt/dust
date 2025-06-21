import React, { memo, type ComponentType, type ReactNode } from "react";

import type { LightWorkspaceType } from "@app/types";

import { DataSourceViewsProvider } from "./DataSourceViewsContext";
import { DustAppsProvider } from "./DustAppsContext";
import { MCPServerViewsProvider } from "./MCPServerViewsContext";
import { PreviewPanelProvider } from "./PreviewPanelContext";
import { SpacesProvider } from "./SpacesContext";

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
              <DustAppsProvider owner={owner}>{children}</DustAppsProvider>
            </MCPServerViewsProvider>
          </DataSourceViewsProvider>
        </SpacesProvider>
      </PreviewPanelProvider>
    );
  }
);

AssistantBuilderProviders.displayName = "AssistantBuilderProviders";
