import { createContext, useState } from "react";
import { useEffect } from "react";

import { DataSourceViewsProvider } from "@app/components/assistant_builder/contexts/DataSourceViewsContext";
import { mcpServerViewSortingFn } from "@app/lib/actions/mcp_helper";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import type { AppType, SpaceType, WorkspaceType } from "@app/types";

interface AssistantBuilderProviderProps {
  owner: WorkspaceType;
  dustApps: AppType[];
  spaces: SpaceType[];
  mcpServerViews: MCPServerViewType[];
  children: React.ReactNode;
}

type AssistantBuilderContextType = {
  dustApps: AppType[];
  spaces: SpaceType[];
  mcpServerViews: MCPServerViewType[];
  isPreviewPanelOpen: boolean;
  setIsPreviewPanelOpen: React.Dispatch<React.SetStateAction<boolean>>;
};

export const AssistantBuilderContext =
  createContext<AssistantBuilderContextType>({
    dustApps: [],
    spaces: [],
    mcpServerViews: [],
    isPreviewPanelOpen: true,
    setIsPreviewPanelOpen: () => {},
  });

export function AssistantBuilderProvider({
  dustApps,
  spaces,
  mcpServerViews,
  owner,
  children,
}: AssistantBuilderProviderProps) {
  const [isPreviewPanelOpen, setIsPreviewPanelOpen] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }
    return window.innerWidth >= 1024;
  });

  useEffect(() => {
    const mediaQuery = window.matchMedia("(min-width: 1024px)");

    const handleMediaChange = (event: MediaQueryListEvent) => {
      setIsPreviewPanelOpen(event.matches);
    };
    mediaQuery.addEventListener("change", handleMediaChange);
    return () => {
      mediaQuery.removeEventListener("change", handleMediaChange);
    };
  }, []);
  return (
    <AssistantBuilderContext.Provider
      value={{
        dustApps,
        spaces,
        mcpServerViews: mcpServerViews.sort(mcpServerViewSortingFn),
        isPreviewPanelOpen,
        setIsPreviewPanelOpen,
      }}
    >
      <DataSourceViewsProvider owner={owner}>
        {children}
      </DataSourceViewsProvider>
    </AssistantBuilderContext.Provider>
  );
}
