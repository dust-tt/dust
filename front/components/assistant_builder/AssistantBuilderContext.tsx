import { createContext, useState } from "react";
import { useEffect } from "react";

import { mcpServerViewSortingFn } from "@app/lib/actions/mcp_helper";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import type {
  AppType,
  DataSourceViewType,
  SpaceType,
  WorkspaceType,
} from "@app/types";

import { MCPServerViewsProvider } from "./contexts/MCPServerViewsContext";

type AssistantBuilderContextType = {
  dustApps: AppType[];
  dataSourceViews: DataSourceViewType[];
  spaces: SpaceType[];
  isPreviewPanelOpen: boolean;
  setIsPreviewPanelOpen: React.Dispatch<React.SetStateAction<boolean>>;
};

export const AssistantBuilderContext =
  createContext<AssistantBuilderContextType>({
    dustApps: [],
    dataSourceViews: [],
    spaces: [],
    isPreviewPanelOpen: true,
    setIsPreviewPanelOpen: () => {},
  });

interface AssistantBuilderProviderProps {
  owner: WorkspaceType;
  dustApps: AppType[];
  dataSourceViews: DataSourceViewType[];
  spaces: SpaceType[];
  children: React.ReactNode;
}

export function AssistantBuilderProvider({
  owner,
  dustApps,
  dataSourceViews,
  spaces,
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
        dataSourceViews,
        spaces,
        isPreviewPanelOpen,
        setIsPreviewPanelOpen,
      }}
    >
      <MCPServerViewsProvider owner={owner} spaces={spaces}>
        {children}
      </MCPServerViewsProvider>
    </AssistantBuilderContext.Provider>
  );
}
