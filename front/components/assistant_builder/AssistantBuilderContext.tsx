import { createContext, useState } from "react";
import { useEffect } from "react";

import { mcpServerViewSortingFn } from "@app/lib/actions/mcp_helper";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import { useDataSourceViews } from "@app/lib/swr/data_source_views";
import { useMCPServerViewsFromSpaces } from "@app/lib/swr/mcp_servers";
import { useSpaces } from "@app/lib/swr/spaces";
import type {
  DataSourceViewType,
  LightWorkspaceType,
  SpaceType,
} from "@app/types";

type AssistantBuilderContextType = {
  dataSourceViews: DataSourceViewType[];
  spaces: SpaceType[];
  mcpServerViews: MCPServerViewType[];
  isPreviewPanelOpen: boolean;
  setIsPreviewPanelOpen: React.Dispatch<React.SetStateAction<boolean>>;
  isSpacesLoading: boolean;
  isDataSourceViewsLoading: boolean;
  isMCPServerViewsLoading: boolean;
  isSpacesError: boolean;
  isDataSourceViewsError: boolean;
  isMCPServerViewsError: boolean;
};

export const AssistantBuilderContext =
  createContext<AssistantBuilderContextType>({
    dataSourceViews: [],
    spaces: [],
    mcpServerViews: [],
    isPreviewPanelOpen: true,
    setIsPreviewPanelOpen: () => {},
    isSpacesLoading: false,
    isDataSourceViewsLoading: false,
    isMCPServerViewsLoading: false,
    isSpacesError: false,
    isDataSourceViewsError: false,
    isMCPServerViewsError: false,
  });

export function AssistantBuilderProvider({
  owner,
  children,
}: {
  owner: LightWorkspaceType;
  children: React.ReactNode;
}) {
  const [isPreviewPanelOpen, setIsPreviewPanelOpen] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }
    return window.innerWidth >= 1024;
  });

  const { spaces, isSpacesLoading, isSpacesError } = useSpaces({
    workspaceId: owner.sId,
  });

  const {
    serverViews: mcpServerViews,
    isLoading: isMCPServerViewsLoading,
    isError: isMCPServerViewsError,
  } = useMCPServerViewsFromSpaces(owner, spaces, ["manual", "auto"]);

  const { dataSourceViews, isDataSourceViewsLoading, isDataSourceViewsError } =
    useDataSourceViews(owner);

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
        dataSourceViews,
        spaces,
        mcpServerViews: mcpServerViews?.sort(mcpServerViewSortingFn) || [],
        isPreviewPanelOpen,
        setIsPreviewPanelOpen,
        isSpacesLoading,
        isDataSourceViewsLoading,
        isMCPServerViewsLoading,
        isSpacesError,
        isDataSourceViewsError,
        isMCPServerViewsError,
      }}
    >
      {children}
    </AssistantBuilderContext.Provider>
  );
}
