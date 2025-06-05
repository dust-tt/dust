import { createContext, useState } from "react";
import { useEffect } from "react";

import { mcpServerViewSortingFn } from "@app/lib/actions/mcp_helper";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import type { AppType, DataSourceViewType, SpaceType } from "@app/types";

type AgentBuilderContextType = {
  dustApps: AppType[];
  dataSourceViews: DataSourceViewType[];
  spaces: SpaceType[];
  mcpServerViews: MCPServerViewType[];
  isPreviewPanelOpen: boolean;
  setIsPreviewPanelOpen: React.Dispatch<React.SetStateAction<boolean>>;
};

export const AgentBuilderContext = createContext<AgentBuilderContextType>({
  dustApps: [],
  dataSourceViews: [],
  spaces: [],
  mcpServerViews: [],
  isPreviewPanelOpen: true,
  setIsPreviewPanelOpen: () => {},
});

interface AgentBuilderContextProps
  extends Omit<
    AgentBuilderContextType,
    "isPreviewPanelOpen" | "setIsPreviewPanelOpen"
  > {
  children: React.ReactNode;
}

export function AgentBuilderProvider({
  dustApps,
  dataSourceViews,
  spaces,
  mcpServerViews,
  children,
}: AgentBuilderContextProps) {
  const [isPreviewPanelOpen, setIsPreviewPanelOpen] = useState(false);

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
        dustApps,
        dataSourceViews,
        spaces,
        mcpServerViews: mcpServerViews.sort(mcpServerViewSortingFn),
        isPreviewPanelOpen,
        setIsPreviewPanelOpen,
      }}
    >
      {children}
    </AgentBuilderContext.Provider>
  );
}
