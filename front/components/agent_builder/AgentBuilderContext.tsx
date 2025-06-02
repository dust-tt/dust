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

export function AgentBuilderProvider({
  dustApps,
  dataSourceViews,
  spaces,
  mcpServerViews,
  children,
}: Omit<
  AgentBuilderContextType,
  "isPreviewPanelOpen" | "setIsPreviewPanelOpen"
> & {
  children: React.ReactNode;
}) {
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
