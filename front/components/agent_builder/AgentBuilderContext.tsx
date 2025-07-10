import { createContext, useContext, useEffect, useMemo, useState } from "react";

import { MCPServerViewsProvider } from "@app/components/assistant_builder/contexts/MCPServerViewsContext";
import { SpacesProvider } from "@app/components/assistant_builder/contexts/SpacesContext";
import { supportsDocumentsData } from "@app/lib/data_sources";
import { useDataSourceViews } from "@app/lib/swr/data_source_views";
import { useFeatureFlags } from "@app/lib/swr/workspaces";
import type { DataSourceViewType, UserType, WorkspaceType } from "@app/types";

type AgentBuilderContextType = {
  owner: WorkspaceType;
  user: UserType;
  supportedDataSourceViews: DataSourceViewType[];
  isPreviewPanelOpen: boolean;
  setIsPreviewPanelOpen: React.Dispatch<React.SetStateAction<boolean>>;
};

export const AgentBuilderContext = createContext<AgentBuilderContextType>({
  owner: {} as WorkspaceType,
  user: {} as UserType,
  supportedDataSourceViews: [],
  isPreviewPanelOpen: true,
  setIsPreviewPanelOpen: () => {},
});

interface AgentBuilderContextProps
  extends Omit<
    AgentBuilderContextType,
    "supportedDataSourceViews" | "isPreviewPanelOpen" | "setIsPreviewPanelOpen"
  > {
  children: React.ReactNode;
}

export function AgentBuilderProvider({
  owner,
  user,
  children,
}: AgentBuilderContextProps) {
  const [isPreviewPanelOpen, setIsPreviewPanelOpen] = useState(false);

  const { dataSourceViews } = useDataSourceViews(owner);
  const { featureFlags } = useFeatureFlags({
    workspaceId: owner.sId,
  });

  // Filter data sources for document search (excluding table-only sources)
  const supportedDataSourceViews = useMemo(() => {
    return dataSourceViews.filter((dsv) =>
      supportsDocumentsData(dsv.dataSource, featureFlags)
    );
  }, [dataSourceViews, featureFlags]);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(min-width: 1024px)");

    // Set initial state based on screen size after hydration
    setIsPreviewPanelOpen(mediaQuery.matches);

    const handleMediaChange = (event: MediaQueryListEvent) => {
      setIsPreviewPanelOpen(event.matches);
    };
    mediaQuery.addEventListener("change", handleMediaChange);
    return () => {
      mediaQuery.removeEventListener("change", handleMediaChange);
    };
  }, []);
  return (
    <AgentBuilderContext.Provider
      value={{
        owner,
        user,
        supportedDataSourceViews,
        isPreviewPanelOpen,
        setIsPreviewPanelOpen,
      }}
    >
      <SpacesProvider owner={owner}>
        <MCPServerViewsProvider owner={owner}>
          {children}
        </MCPServerViewsProvider>
      </SpacesProvider>
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
